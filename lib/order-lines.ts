/** Merge duplicate product lines (same rules as cart → order). */
export type OrderLineInput = { productId: string; quantity: number };

export function mergeOrderLines(lines: OrderLineInput[]): OrderLineInput[] {
  const m = new Map<string, number>();
  for (const l of lines) {
    if (!l.productId || l.quantity <= 0) continue;
    m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity);
  }
  return [...m.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}
