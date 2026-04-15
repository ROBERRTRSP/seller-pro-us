import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { incrementProductStock } from "@/lib/order-stock";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["PENDIENTE", "ENVIADO", "COMPLETADO", "CANCELADO"] as const;

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await ctx.params;
  let body: { status?: string; adminNote?: string | null; accept?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const hasStatus = body.status !== undefined && String(body.status).length > 0;
  const hasNote = body.adminNote !== undefined;
  const hasAccept = body.accept === true;

  if (!hasStatus && !hasNote && !hasAccept) {
    return NextResponse.json({ error: "Provide status, internal note, or accept: true" }, { status: 400 });
  }

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: { status?: string; adminNote?: string | null; acceptedAt?: Date } = {};

  if (hasAccept) {
    if (existing.status !== "PENDIENTE" || existing.acceptedAt != null) {
      return NextResponse.json(
        { error: "Only pending orders that are not yet accepted can be accepted." },
        { status: 400 },
      );
    }
    data.acceptedAt = new Date();
  }

  if (hasStatus) {
    const status = String(body.status).toUpperCase();
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
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
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
