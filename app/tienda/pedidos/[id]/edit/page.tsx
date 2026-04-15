"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { clientCanEditOrCancelOrder } from "@/lib/order-client-actions";
import { MAX_ORDER_LINE_QUANTITY } from "@/lib/order-quantity-limits";
import { isOutOfStock, isUnlimitedStock, stockPurchaseCap } from "@/lib/product-stock";

type OrderItem = {
  id: string;
  quantity: number;
  priceCents: number;
  productId: string;
  product: {
    id: string;
    name: string;
    priceCents: number;
    stock: number;
    imageUrl: string | null;
  };
};

type Order = {
  id: string;
  status: string;
  acceptedAt: string | null;
  totalCents: number;
  items: OrderItem[];
};

function mergeOrderItemsByProduct(items: OrderItem[]): OrderItem[] {
  const byPid = new Map<string, OrderItem>();
  for (const it of items) {
    const pid = it.product.id;
    const prev = byPid.get(pid);
    if (!prev) {
      byPid.set(pid, { ...it });
    } else {
      byPid.set(pid, {
        ...prev,
        quantity: prev.quantity + it.quantity,
      });
    }
  }
  return [...byPid.values()];
}

export default function EditOrderPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id ?? "");

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /** Cantidad en el pedido al abrir la página (límite si el producto pasa a “no hay”). */
  const [initialQtyByProduct, setInitialQtyByProduct] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/orders/${id}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar el pedido");
        return d as Order;
      })
      .then((o) => {
        if (cancelled) return;
        if (!clientCanEditOrCancelOrder(o)) {
          router.replace("/tienda/pedidos");
          return;
        }
        const mergedItems = mergeOrderItemsByProduct(o.items);
        setOrder({ ...o, items: mergedItems });
        const m = new Map<string, number>();
        for (const it of mergedItems) {
          m.set(it.product.id, it.quantity);
        }
        setInitialQtyByProduct(m);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message ?? "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  function setQty(productId: string, quantity: number) {
    if (!order) return;
    const it = order.items.find((i) => i.product.id === productId);
    if (!it) return;
    const initial = initialQtyByProduct.get(productId) ?? 0;
    const max = isOutOfStock(it.product.stock)
      ? initial
      : stockPurchaseCap(it.product.stock, MAX_ORDER_LINE_QUANTITY);
    const q = Math.max(0, Math.min(quantity, max));
    setOrder({
      ...order,
      items: order.items.map((i) => (i.product.id === productId ? { ...i, quantity: q } : i)),
    });
  }

  const total = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((s, it) => s + it.product.priceCents * it.quantity, 0);
  }, [order]);

  async function save() {
    if (!order) return;
    setError("");
    setSaving(true);
    try {
      const lines = order.items
        .filter((it) => it.quantity > 0)
        .map((it) => ({ productId: it.product.id, quantity: it.quantity }));
      if (lines.length === 0) {
        setError("Añade al menos un artículo con cantidad mayor que cero.");
        return;
      }
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudieron guardar los cambios");
        return;
      }
      router.push("/tienda/pedidos");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-neutral-600">Cargando…</p>;
  }
  if (error && !order) {
    return (
      <div>
        <p className="text-red-600">{error}</p>
        <Link href="/tienda/pedidos" className="mt-4 inline-block text-sm font-semibold text-[#0071dc] hover:underline">
          ← Volver a mis pedidos
        </Link>
      </div>
    );
  }
  if (!order) {
    return null;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">Editar pedido</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">
        Cambia cantidades hasta que la tienda acepte el pedido. Los precios siguen el catálogo actual.
      </p>
      <Link href="/tienda/pedidos" className="mt-2 inline-block text-sm font-semibold text-[#0071dc] hover:underline">
        ← Volver a mis pedidos
      </Link>

      <ul className="mt-8 space-y-4">
        {order.items.map((it) => {
          const initial = initialQtyByProduct.get(it.product.id) ?? 0;
          const max = isOutOfStock(it.product.stock)
            ? initial
            : stockPurchaseCap(it.product.stock, MAX_ORDER_LINE_QUANTITY);
          return (
            <li
              key={it.product.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-medium text-neutral-900">{it.product.name}</p>
                <p className="text-sm text-neutral-600">{formatCents(it.product.priceCents)} c/u</p>
                <p className="text-xs text-neutral-500">
                  {isOutOfStock(it.product.stock)
                    ? `Sin existencias: máximo ${initial} (lo que ya tenías en el pedido)`
                    : isUnlimitedStock(it.product.stock)
                      ? `Hasta ${MAX_ORDER_LINE_QUANTITY} unidades por pedido (stock ilimitado)`
                      : `Hasta ${stockPurchaseCap(it.product.stock, MAX_ORDER_LINE_QUANTITY)} unidades (stock ${it.product.stock})`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600" htmlFor={`q-${it.product.id}`}>
                  Cant.
                </label>
                <input
                  id={`q-${it.product.id}`}
                  type="number"
                  min={0}
                  max={max}
                  value={it.quantity}
                  onChange={(e) => setQty(it.product.id, Number(e.target.value))}
                  className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-sm"
                />
              </div>
              <p className="font-semibold text-neutral-900">{formatCents(it.product.priceCents * it.quantity)}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-bold text-neutral-900">Nuevo total: {formatCents(total)}</p>
        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="mt-4 w-full rounded-lg bg-[#0071dc] py-3 text-sm font-semibold text-white hover:bg-[#005bb5] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
