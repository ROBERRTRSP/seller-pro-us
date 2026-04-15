import type { Prisma } from "@prisma/client";
import type { OrderLineInput } from "@/lib/order-lines";

/** Parse JSON body `items` the same way as storefront order edit. */
export function parseJsonOrderLines(items: unknown): OrderLineInput[] {
  const arr = Array.isArray(items) ? items : [];
  return arr
    .map((i: { productId?: string; quantity?: number }) => ({
      productId: String(i.productId ?? ""),
      quantity: Math.max(0, Math.floor(Number(i.quantity) || 0)),
    }))
    .filter((i) => i.productId && i.quantity > 0);
}
import { MAX_ORDER_LINE_QUANTITY } from "@/lib/order-quantity-limits";
import { hasValidProductImage } from "@/lib/product-image";
import {
  incrementProductStock,
  InsufficientStockError,
  tryDecrementProductStock,
} from "@/lib/order-stock";

/**
 * Replaces all order lines: restores stock for old lines, then reserves for new lines
 * and updates `totalCents` + items. Caller must enforce business rules (e.g. status).
 */
export async function replaceOrderItemsForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  cleanedLines: OrderLineInput[],
): Promise<void> {
  const o = await tx.order.findFirst({ where: { id: orderId }, include: { items: true } });
  if (!o) {
    throw new Error("ORDER_NOT_FOUND");
  }

  for (const it of o.items) {
    await incrementProductStock(tx, it.productId, it.quantity);
  }

  await tx.orderItem.deleteMany({ where: { orderId } });

  const ids = [...new Set(cleanedLines.map((c) => c.productId))];
  const products = await tx.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  let totalCents = 0;
  const lines: { productId: string; quantity: number; priceCents: number }[] = [];

  for (const line of cleanedLines) {
    const p = byId.get(line.productId);
    if (!p) {
      throw new Error(`Product not found: ${line.productId}`);
    }
    if (line.quantity > MAX_ORDER_LINE_QUANTITY) {
      throw new Error(`Maximum ${MAX_ORDER_LINE_QUANTITY} units per product (“${p.name}”).`);
    }
    if (!hasValidProductImage(p.imageUrl)) {
      throw new Error(`“${p.name}” is not available without a photo.`);
    }
    const ok = await tryDecrementProductStock(tx, line.productId, line.quantity);
    if (!ok) {
      throw new InsufficientStockError(p.name);
    }
    totalCents += p.priceCents * line.quantity;
    lines.push({ productId: p.id, quantity: line.quantity, priceCents: p.priceCents });
  }

  await tx.order.update({
    where: { id: orderId },
    data: {
      totalCents,
      items: {
        create: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          priceCents: l.priceCents,
        })),
      },
    },
  });
}
