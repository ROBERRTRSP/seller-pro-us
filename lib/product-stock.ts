export const UNLIMITED_STOCK = -1;

export function isUnlimitedStock(stock: number): boolean {
  return stock === UNLIMITED_STOCK;
}

export function isOutOfStock(stock: number): boolean {
  return !isUnlimitedStock(stock) && stock < 1;
}

export function stockPurchaseCap(stock: number, perLineMax: number): number {
  if (isUnlimitedStock(stock)) return perLineMax;
  return Math.min(Math.max(0, stock), perLineMax);
}
