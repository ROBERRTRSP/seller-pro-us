/** Shoppers may change quantities or cancel only while the order is pending and the store has not accepted it. */
export function clientCanEditOrCancelOrder(o: {
  status: string;
  acceptedAt: Date | string | null | undefined;
}): boolean {
  if (o.status !== "PENDIENTE") return false;
  if (o.acceptedAt != null && o.acceptedAt !== "") return false;
  return true;
}
