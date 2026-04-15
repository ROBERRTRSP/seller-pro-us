/** Locale for dates, numbers, and status labels (USD currency unchanged in money.ts). */
export const APP_LOCALE = "es-US" as const;

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  ENVIADO: "Enviado",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

export function formatOrderStatus(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

/** Pendiente + acceptedAt: la tienda aceptó; el cliente ya no puede editar ni cancelar. */
export function formatCustomerOrderStatus(order: { status: string; acceptedAt?: string | Date | null }): string {
  if (order.status === "PENDIENTE" && order.acceptedAt != null) {
    return "Pendiente (tienda aceptó)";
  }
  return formatOrderStatus(order.status);
}

export function formatDateTimeUs(iso: Date | string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString(APP_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDateUs(iso: Date | string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(APP_LOCALE, { dateStyle: "medium" });
}
