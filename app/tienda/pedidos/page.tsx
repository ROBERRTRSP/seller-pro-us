"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { APP_LOCALE, formatCustomerOrderStatus } from "@/lib/us-locale";
import { clientCanEditOrCancelOrder } from "@/lib/order-client-actions";
import { productCatalogImageVisible } from "@/lib/product-image";

type OrderItem = {
  quantity: number;
  priceCents: number;
  product: { id: string; name: string; imageUrl: string | null; imagePending: boolean };
};

type Order = {
  id: string;
  status: string;
  acceptedAt: string | null;
  totalCents: number;
  createdAt: string;
  items: OrderItem[];
};

export default function PedidosClientePage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    try {
      const r = await fetch("/api/orders", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (Array.isArray(d)) setOrders(d);
      else if (!r.ok) setOrders([]);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    const onFocus = () => {
      void load(false);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function cancelOrder(orderId: string) {
    if (!confirm("¿Cancelar este pedido? Las existencias vuelven a la tienda.")) return;
    setBusyId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "No se pudo cancelar");
        return;
      }
      await load(false);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-neutral-600">Cargando pedidos…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">Mis pedidos</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">
        Lo que pediste. Pagas al recibir: sin prepago ni crédito en tienda. Puedes editar o cancelar un pedido{" "}
        <strong>pendiente</strong> hasta que la tienda lo acepte (después queda bloqueado).
      </p>
      <Link
        href="/tienda"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#0071dc] touch-manipulation hover:underline"
      >
        ← Volver a la tienda
      </Link>

      {orders.length === 0 ? (
        <p className="mt-8 text-neutral-600">Aún no has hecho ningún pedido.</p>
      ) : (
        <ul className="mt-8 space-y-6">
          {orders.map((o) => {
            const canEdit = clientCanEditOrCancelOrder(o);
            return (
              <li
                key={o.id}
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-neutral-600">
                    {new Date(o.createdAt).toLocaleString(APP_LOCALE, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {formatCustomerOrderStatus(o)}
                    </span>
                    <Link
                      href={`/tienda/pedidos/${o.id}/imprimir`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-[#0071dc] hover:underline"
                    >
                      Imprimir
                    </Link>
                  </div>
                </div>
                <p className="mt-2 font-bold text-neutral-900">
                  {formatCents(o.totalCents)}
                  {o.status === "PENDIENTE" ? (
                    <span className="ml-2 text-sm font-normal text-neutral-600">(pago al recibir)</span>
                  ) : null}
                </p>
                {canEdit ? (
                  <p className="mt-1 text-xs text-amber-900/80">
                    Esperando aceptación de la tienda: aún puedes cambiar cantidades o cancelar.
                  </p>
                ) : o.status === "PENDIENTE" && o.acceptedAt ? (
                  <p className="mt-1 text-xs text-neutral-600">La tienda aceptó este pedido; ya no se puede modificar.</p>
                ) : null}
                <ul className="mt-3 space-y-2 text-sm text-neutral-600">
                  {o.items.map((it, i) => {
                    const showImg = productCatalogImageVisible(
                      it.product.imagePending,
                      it.product.imageUrl,
                    );
                    return (
                      <li key={i} className="flex items-center gap-3">
                        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                          {showImg ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={it.product.imageUrl!}
                              alt=""
                              className="h-full w-full object-contain p-0.5"
                              loading="lazy"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center px-0.5 text-center text-[9px] font-medium leading-tight text-amber-800">
                              Foto pendiente
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          {it.product.name} × {it.quantity} — {formatCents(it.priceCents * it.quantity)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {canEdit ? (
                  <div className="mt-4 flex flex-col gap-2 border-t border-neutral-100 pt-4 sm:flex-row sm:flex-wrap">
                    <Link
                      href={`/tienda/pedidos/${o.id}/edit`}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-neutral-200 bg-white px-4 text-sm font-semibold text-[#0071dc] touch-manipulation hover:bg-neutral-50 sm:flex-initial sm:px-4 sm:py-2"
                    >
                      Editar pedido
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === o.id}
                      onClick={() => void cancelOrder(o.id)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-800 touch-manipulation hover:bg-red-100 disabled:opacity-50 sm:flex-initial sm:py-2"
                    >
                      {busyId === o.id ? "Cancelando…" : "Cancelar pedido"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
