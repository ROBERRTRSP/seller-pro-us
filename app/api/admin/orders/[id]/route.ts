import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { mergeOrderLines } from "@/lib/order-lines";
import {
  parseJsonOrderLines,
  replaceOrderItemsForOrder,
} from "@/lib/replace-order-items";
import { incrementProductStock, InsufficientStockError } from "@/lib/order-stock";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["PENDIENTE", "ENVIADO", "COMPLETADO", "CANCELADO"] as const;

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await ctx.params;
  let body: { status?: string; adminNote?: string | null; accept?: boolean; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const hasStatus = body.status !== undefined && String(body.status).length > 0;
  const hasNote = body.adminNote !== undefined;
  const hasAccept = body.accept === true;
  const hasItems = body.items !== undefined;

  if (!hasStatus && !hasNote && !hasAccept && !hasItems) {
    return NextResponse.json(
      { error: "Indica estado, nota interna, accept: true o líneas del pedido (items)." },
      { status: 400 },
    );
  }

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  if (hasItems) {
    if (existing.status !== "PENDIENTE") {
      return NextResponse.json(
        { error: "Solo se pueden editar las líneas de pedidos en estado pendiente." },
        { status: 400 },
      );
    }
    if (hasAccept) {
      return NextResponse.json(
        { error: "No combines editar líneas con aceptar el pedido en la misma acción. Acepta primero o edita líneas solo." },
        { status: 400 },
      );
    }
    if (hasStatus && String(body.status).toUpperCase() === "CANCELADO") {
      return NextResponse.json(
        { error: "Para cancelar, cambia el estado a cancelado en una acción aparte (sin editar líneas a la vez)." },
        { status: 400 },
      );
    }
    if (body.items === null || !Array.isArray(body.items)) {
      return NextResponse.json({ error: "items debe ser un array de { productId, quantity }." }, { status: 400 });
    }
  }

  const data: { status?: string; adminNote?: string | null; acceptedAt?: Date } = {};

  if (hasAccept) {
    if (existing.status !== "PENDIENTE" || existing.acceptedAt != null) {
      return NextResponse.json(
        { error: "Solo se pueden aceptar pedidos pendientes que aún no estén aceptados." },
        { status: 400 },
      );
    }
    data.acceptedAt = new Date();
  }

  if (hasStatus) {
    const status = String(body.status).toUpperCase();
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
    }
    data.status = status;
    if (
      existing.status === "PENDIENTE" &&
      status !== "PENDIENTE" &&
      status !== "CANCELADO" &&
      existing.acceptedAt == null &&
      !hasAccept
    ) {
      data.acceptedAt = new Date();
    }
  }

  if (hasNote) {
    const note = body.adminNote;
    data.adminNote = note === null || note === "" ? null : String(note).slice(0, 2000);
  }

  const goingCancel = data.status === "CANCELADO" && existing.status !== "CANCELADO";

  try {
    if (hasItems) {
      const cleaned = mergeOrderLines(parseJsonOrderLines(body.items));
      if (cleaned.length === 0) {
        return NextResponse.json(
          { error: "El pedido debe incluir al menos un producto con cantidad mayor que 0." },
          { status: 400 },
        );
      }

      const o = await prisma.$transaction(async (tx) => {
        await replaceOrderItemsForOrder(tx, id, cleaned);
        if (Object.keys(data).length > 0) {
          return tx.order.update({ where: { id }, data });
        }
        return tx.order.findUniqueOrThrow({ where: { id } });
      });
      return NextResponse.json(o);
    }

    if (goingCancel) {
      const o = await prisma.$transaction(async (tx) => {
        const items = await tx.orderItem.findMany({ where: { orderId: id } });
        for (const it of items) {
          await incrementProductStock(tx, it.productId, it.quantity);
        }
        return tx.order.update({ where: { id }, data });
      });
      return NextResponse.json(o);
    }

    const o = await prisma.order.update({
      where: { id },
      data,
    });
    return NextResponse.json(o);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: `No hay existencias suficientes para «${e.productName}».` },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (
      msg.startsWith("Maximum") ||
      msg.startsWith("“") ||
      msg.startsWith("Product not found")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[admin/orders PATCH]", e);
    return NextResponse.json({ error: "No se pudo actualizar el pedido." }, { status: 500 });
  }
}
