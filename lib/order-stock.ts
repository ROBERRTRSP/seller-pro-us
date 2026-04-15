import type { Prisma } from "@prisma/client";
import { UNLIMITED_STOCK } from "@/lib/product-stock";

export class InsufficientStockError extends Error {
  readonly productName: string;
  constructor(productName: string) {
    super("Insufficient stock");
    this.name = "InsufficientStockError";
    this.productName = productName;
  }
}

/** Atomically reserves `quantity` units if enough stock; returns false if not applied. */
export async function tryDecrementProductStock(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
): Promise<boolean> {
  const unlimited = await tx.product.findFirst({
    where: { id: productId, stock: UNLIMITED_STOCK },
    select: { id: true },
  });
  if (unlimited) return true;

  const r = await tx.product.updateMany({
    where: { id: productId, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });
  return r.count === 1;
}

export async function incrementProductStock(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
): Promise<void> {
  await tx.product.updateMany({
    where: { id: productId, NOT: { stock: UNLIMITED_STOCK } },
    data: { stock: { increment: quantity } },
  });
}
