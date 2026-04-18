import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { mergeOrderLines } from "@/lib/order-lines";
import { InsufficientStockError, tryDecrementProductStock } from "@/lib/order-stock";
import { MAX_ORDER_LINE_QUANTITY } from "@/lib/order-quantity-limits";

function trimOrNull(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

type Line = { productId: string; quantity: number };

export async function POST(req: Request) {
  const gate = await requireRole(Role.CLIENT);
  if ("error" in gate && gate.error) return gate.error;
  const { session } = gate;

  let body: { items?: Line[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const cleaned: Line[] = items
    .map((i) => ({
      productId: String(i.productId ?? ""),
      quantity: Math.max(0, Math.floor(Number(i.quantity) || 0)),
    }))
    .filter((i) => i.productId && i.quantity > 0);

  const merged = mergeOrderLines(cleaned);
  if (merged.length === 0) {
    return NextResponse.json({ error: "El carrito está vacío" }, { status: 400 });
  }

  const profileUser = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      phone: true,
      address: true,
      businessLicense: true,
      tobaccoLicense: true,
    },
  });

  const ids = [...new Set(merged.map((c) => c.productId))];

  try {
    const order = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: ids }, catalogPublished: true },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      let totalCents = 0;
      const lines: { productId: string; quantity: number; priceCents: number }[] = [];

      for (const line of merged) {
        const p = byId.get(line.productId);
        if (!p) {
          throw new Error("PRODUCT_NOT_FOUND");
        }
        if (line.quantity > MAX_ORDER_LINE_QUANTITY) {
          throw new Error(`MAX_QTY:${p.name}`);
        }
        const ok = await tryDecrementProductStock(tx, line.productId, line.quantity);
        if (!ok) {
          throw new InsufficientStockError(p.name);
        }
        totalCents += p.priceCents * line.quantity;
        lines.push({ productId: p.id, quantity: line.quantity, priceCents: p.priceCents });
      }

      const order = await tx.order.create({
        data: {
          userId: session.sub,
          totalCents,
          status: "PENDIENTE",
          deliveryPhone: trimOrNull(profileUser?.phone ?? null),
          deliveryAddress: trimOrNull(profileUser?.address ?? null),
          deliveryBusinessLicense: trimOrNull(profileUser?.businessLicense ?? null),
          deliveryTobaccoLicense: trimOrNull(profileUser?.tobaccoLicense ?? null),
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              priceCents: l.priceCents,
            })),
          },
        },
      });

      for (const line of merged) {
        await tx.product.update({
          where: { id: line.productId },
          data: { salesCount: { increment: line.quantity } },
        });
      }

      return order;
    });

    return NextResponse.json({ id: order.id, totalCents: order.totalCents });
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: `No hay existencias suficientes para «${e.productName}».` },
        { status: 409 },
      );
    }
    if (e instanceof Error) {
      if (e.message === "PRODUCT_NOT_FOUND") {
        return NextResponse.json({ error: "Producto no encontrado." }, { status: 400 });
      }
      if (e.message.startsWith("MAX_QTY:")) {
        const name = e.message.slice("MAX_QTY:".length);
        return NextResponse.json(
          { error: `Máximo ${MAX_ORDER_LINE_QUANTITY} unidades por producto («${name}»).` },
          { status: 400 },
        );
      }
    }
    console.error("[orders POST]", e);
    return NextResponse.json({ error: "No se pudo crear el pedido." }, { status: 500 });
  }
}

export async function GET() {
  const gate = await requireRole(Role.CLIENT);
  if ("error" in gate && gate.error) return gate.error;
  const { session } = gate;

  const orders = await prisma.order.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { product: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json(orders, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
