/**
 * Filtro por fecha de creación del pedido (YYYY-MM-DD en calendario UTC).
 * Para informes y export CSV.
 */

export type OrderCreatedRange = { gte?: Date; lte?: Date };

export function parseOrderCreatedRangeQuery(
  fromRaw?: string | null,
  toRaw?: string | null,
): OrderCreatedRange | undefined {
  let from = normalizeDateOnly(fromRaw);
  let to = normalizeDateOnly(toRaw);
  if (from && to && from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  let gte: Date | undefined;
  let lte: Date | undefined;
  if (from) {
    const [y, m, d] = from.split("-").map(Number);
    gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  }
  if (to) {
    const [y, m, d] = to.split("-").map(Number);
    lte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  }
  if (!gte && !lte) return undefined;
  return {
    ...(gte !== undefined ? { gte } : {}),
    ...(lte !== undefined ? { lte } : {}),
  };
}

function normalizeDateOnly(s?: string | null): string | undefined {
  const t = String(s ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined;
}

/** Query string opcional ?from=&to= para enlazar export CSV con el mismo filtro. */
export function appendOrdersExportQuery(fromRaw?: string | null, toRaw?: string | null): string {
  const p = new URLSearchParams();
  const f = normalizeDateOnly(fromRaw);
  const t = normalizeDateOnly(toRaw);
  if (f) p.set("from", f);
  if (t) p.set("to", t);
  const q = p.toString();
  return q ? `?${q}` : "";
}
