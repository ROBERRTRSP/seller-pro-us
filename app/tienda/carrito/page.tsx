"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { MAX_ORDER_LINE_QUANTITY } from "@/lib/order-quantity-limits";

const CART_KEY = "tienda_cart";

type CartLine = { productId: string; quantity: number };

type Product = {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
};

function readCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(lines: CartLine[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(lines));
}

export default function CarritoPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function refreshCart() {
    setCart(readCart());
  }

  const loadProducts = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    try {
      const r = await fetch("/api/products", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setProducts([]);
        setError(r.status === 401 ? "Sesión caducada. Vuelve a iniciar sesión." : "No se pudieron cargar los productos.");
        return;
      }
      if (Array.isArray(d)) setProducts(d);
      else setProducts([]);
    } catch {
      setProducts([]);
      setError("Error de red al cargar los productos.");
    } finally {
      setLoading(false);
      setCart(readCart());
    }
  }, []);

  useEffect(() => {
    void loadProducts(true);
  }, [loadProducts]);

  useEffect(() => {
    const onFocus = () => {
      void loadProducts(false);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadProducts(false);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadProducts]);

  const byId = new Map(products.map((p) => [p.id, p]));

  let total = 0;
  const rows: { line: CartLine; product: Product }[] = [];
  for (const line of cart) {
    const p = byId.get(line.productId);
    if (p) {
      total += p.priceCents * line.quantity;
      rows.push({ line, product: p });
    }
  }

  function setQty(productId: string, quantity: number) {
    const p = byId.get(productId);
    if (!p) return;
    const prev = readCart().find((l) => l.productId === productId)?.quantity ?? 0;
    const cap = p.stock >= 1 ? Math.min(MAX_ORDER_LINE_QUANTITY, p.stock) : prev;
    const q = Math.max(0, Math.min(quantity, cap));
    const next = readCart().filter((l) => l.productId !== productId);
    if (q > 0) next.push({ productId, quantity: q });
    writeCart(next);
    refreshCart();
  }

  async function checkout() {
    setError("");
    setSubmitting(true);
    try {
      const lines = readCart().filter((l) => l.quantity > 0);
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo registrar el pedido");
        return;
      }
      writeCart([]);
      refreshCart();
      router.push("/tienda/pedidos");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-neutral-600">Cargando…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">Carrito</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-600">
        Al confirmar solo registramos el pedido. Sin tarjeta ni pago online: el total se paga al recibir el pedido. Solo
        efectivo; sin crédito en tienda.
      </p>
      <Link
        href="/tienda"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#0071dc] touch-manipulation hover:underline"
      >
        ← Seguir comprando
      </Link>

      {rows.length === 0 ? (
        <p className="mt-8 text-neutral-600">Tu carrito está vacío.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {rows.map(({ line, product: p }) => (
            <li
              key={p.id}
              className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-neutral-900">{p.name}</p>
                <p className="text-sm text-neutral-500">{formatCents(p.priceCents)} c/u</p>
                {p.stock < 1 ? (
                  <p className="mt-1 text-xs font-medium text-amber-800">
                    No hay existencias: solo puedes bajar la cantidad o quitar el artículo.
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-neutral-600" htmlFor={`q-${p.id}`}>
                  Cant.
                </label>
                <input
                  id={`q-${p.id}`}
                  type="number"
                  min={0}
                  max={p.stock >= 1 ? Math.min(MAX_ORDER_LINE_QUANTITY, p.stock) : line.quantity}
                  value={line.quantity}
                  onChange={(e) => setQty(p.id, Number(e.target.value))}
                  className="min-h-11 w-24 rounded-lg border border-neutral-300 bg-neutral-50 px-3 text-center text-base touch-manipulation sm:min-h-0 sm:w-20 sm:py-1 sm:text-sm"
                />
              </div>
              <p className="text-lg font-semibold text-neutral-900 sm:text-base">
                {formatCents(p.priceCents * line.quantity)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 ? (
        <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-bold text-neutral-900">Total (a pagar al recibir): {formatCents(total)}</p>
          {error ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={submitting}
            onClick={checkout}
            className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-[#0071dc] py-3 text-base font-bold text-white shadow touch-manipulation hover:bg-[#005bb5] disabled:opacity-50 sm:min-h-0 sm:text-sm"
          >
            {submitting ? "Registrando pedido…" : "Confirmar pedido"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
