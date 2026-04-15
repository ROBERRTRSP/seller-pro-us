import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { clientCanEditOrCancelOrder } from "@/lib/order-client-actions";
import { mergeOrderLines } from "@/lib/order-lines";
import { parseJsonOrderLines, replaceOrderItemsForOrder } from "@/lib/replace-order-items";
import { incrementProductStock, InsufficientStockError } from "@/lib/order-stock";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const gate = await requireRole(Role.CLIENT);
  if ("error" in gate && gate.error) return gate.error;
  const { session } = gate;
  const { id } = await ctx.params;

  const order = await prisma.order.findFirst({
    where: { id, userId: session.sub },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, priceCents: true, stock: true, imageUrl: true } },
        },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(order, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireRole(Role.CLIENT);
  if ("error" in gate && gate.error) return gate.error;
  const { session } = gate;
  const { id } = await ctx.params;

  let body: { action?: string; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id, userId: session.sub },
    include: { items: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!clientCanEditOrCancelOrder(order)) {
    return NextResponse.json(
      {
        error:
          "Solo puedes cambiar o cancelar pedidos pendientes que la tienda aún no haya aceptado.",
      },
      { status: 403 },
    );
  }

  if (body.action === "cancel") {
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const o = await tx.order.findFirst({ where: { id, userId: session.sub }, include: { items: true } });
        if (!o || !clientCanEditOrCancelOrder(o)) {
          throw new Error("LOCK");
        }
        for (const it of o.items) {
          await incrementProductStock(tx, it.productId, it.quantity);
        }
        await tx.order.update({
          where: { id },
          data: { status: "CANCELADO" },
        });
        return tx.order.findFirst({
          where: { id, userId: session.sub },
          include: { items: { include: { product: { select: { id: true, name: true } } } } },
        });
      });
      return NextResponse.json(updated);
    } catch (e) {
      if (e instanceof Error && e.message === "LOCK") {
        return NextResponse.json({ error: "Este pedido ya no se puede cancelar." }, { status: 403 });
      }
      throw e;
    }
  }

  const cleaned = mergeOrderLines(parseJsonOrderLines(body.items));
  if (cleaned.length === 0) {
    return NextResponse.json(
      { error: "El pedido debe incluir al menos un producto con cantidad mayor que 0." },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.findFirst({ where: { id, userId: session.sub }, include: { items: true } });
      if (!o || !clientCanEditOrCancelOrder(o)) {
        throw new Error("LOCK");
      }

      await replaceOrderItemsForOrder(tx, id, cleaned);

      return tx.order.findFirst({
        where: { id, userId: session.sub },
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, priceCents: true, stock: true, imageUrl: true } },
            },
          },
        },
      });
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: `No hay existencias suficientes para «${e.productName}».` },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "LOCK") {
      return NextResponse.json({ error: "Este pedido ya no se puede modificar." }, { status: 403 });
    }
    if (
      msg.startsWith("Maximum") ||
      msg.startsWith("“") ||
      msg.startsWith("Product not found")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[orders PATCH]", e);
    return NextResponse.json({ error: "No se pudo actualizar el pedido." }, { status: 500 });
  }
}
