"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ADMIN_FETCH_TIMEOUT, adminFetchJson, type AdminFetchJsonResult } from "@/lib/admin-client-fetch";
import { mergeOrderLines } from "@/lib/order-lines";
import { MAX_ORDER_LINE_QUANTITY } from "@/lib/order-quantity-limits";
import { formatCents } from "@/lib/money";
import { resolveOrderContact } from "@/lib/order-contact-resolved";
import { APP_LOCALE, formatOrderStatus } from "@/lib/us-locale";

type Order = {
  id: string;
  status: string;
  acceptedAt: string | null;
  totalCents: number;
  createdAt: string;
  adminNote: string | null;
  deliveryPhone: string | null;
  deliveryAddress: string | null;
  deliveryBusinessLicense: string | null;
  deliveryTobaccoLicense: string | null;
  user: {
    email: string;
    name: string;
    phone: string | null;
    address: string | null;
    businessLicense: string | null;
    tobaccoLicense: string | null;
  };
  items: { quantity: number; priceCents: number; product: { id: string; name: string } }[];
};

const STATUSES = ["PENDIENTE", "ENVIADO", "COMPLETADO", "CANCELADO"] as const;
const FILTER_ALL = "ALL" as const;
const FILTERS = [FILTER_ALL, ...STATUSES] as const;

/** Colores coherentes por estado: tarjetas, filtros y desplegable. */
function getOrderStatusUi(status: string) {
  switch (status) {
    case "PENDIENTE":
      return {
        card: "border-amber-500/45 bg-amber-950/25 shadow-[inset_4px_0_0_0_rgb(245_158_11)]",
        pillActive: "bg-amber-600 text-white shadow-sm",
        pillInactive:
          "border border-amber-500/45 bg-amber-950/15 text-amber-100/95 hover:bg-amber-950/35",
        select:
          "border-amber-500/55 text-amber-100/95 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/35",
      };
    case "ENVIADO":
      return {
        card: "border-sky-500/45 bg-sky-950/20 shadow-[inset_4px_0_0_0_rgb(56_189_248)]",
        pillActive: "bg-sky-600 text-white shadow-sm",
        pillInactive: "border border-sky-500/45 bg-sky-950/15 text-sky-100/95 hover:bg-sky-950/35",
        select:
          "border-sky-500/55 text-sky-100/95 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/35",
      };
    case "COMPLETADO":
      return {
        card: "border-emerald-500/45 bg-emerald-950/20 shadow-[inset_4px_0_0_0_rgb(52_211_153)]",
        pillActive: "bg-emerald-600 text-white shadow-sm",
        pillInactive:
          "border border-emerald-500/45 bg-emerald-950/15 text-emerald-100/95 hover:bg-emerald-950/35",
        select:
          "border-emerald-500/55 text-emerald-100/95 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/35",
      };
    case "CANCELADO":
      return {
        card: "border-rose-500/45 bg-rose-950/25 shadow-[inset_4px_0_0_0_rgb(251_113_133)]",
        pillActive: "bg-rose-600 text-white shadow-sm",
        pillInactive: "border border-rose-500/45 bg-rose-950/15 text-rose-100/95 hover:bg-rose-950/35",
        select:
          "border-rose-500/55 text-rose-100/95 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/35",
      };
    default:
      return {
        card: "border-[var(--border)] bg-[var(--surface)]",
        pillActive: "bg-[var(--accent)] text-white shadow-sm",
        pillInactive:
          "border border-[var(--border)] bg-[var(--bg)]/30 text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]",
        select:
          "border-[var(--border)] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25",
      };
  }
}

function filterChipClass(filterKey: (typeof FILTERS)[number], selected: boolean): string {
  const base = "rounded-full px-3 py-1 text-sm transition-colors";
  if (filterKey === FILTER_ALL) {
    return `${base} ${
      selected
        ? "bg-zinc-600 text-white shadow-sm"
        : "border border-zinc-500/45 bg-zinc-950/20 text-zinc-300 hover:bg-zinc-900/55 hover:text-zinc-100"
    }`;
  }
  const ui = getOrderStatusUi(filterKey);
  return `${base} ${selected ? ui.pillActive : ui.pillInactive}`;
}

export default function AdminPedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(FILTER_ALL);
  const [notes, setNotes] = useState<Record<string, string>>({});
  /** Draft líneas por pedido: solo pedidos pendientes; se sincroniza al cargar lista. */
  const [itemDrafts, setItemDrafts] = useState<Record<string, { productId: string; quantity: number }[]>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [savingLinesId, setSavingLinesId] = useState<string | null>(null);
  const loadGen = useRef(0);

  function applyOrdersFetch(res: AdminFetchJsonResult<Order[]>) {
    if (!res.ok) {
      setLoadError(
        res.error === ADMIN_FETCH_TIMEOUT
          ? "Tiempo de espera agotado. Comprueba el servidor e inténtalo de nuevo."
          : res.error,
      );
      setOrders([]);
      return;
    }
    const d = res.data;
    if (!Array.isArray(d)) {
      setLoadError("Respuesta inválida del servidor.");
      setOrders([]);
      return;
    }
    setLoadError("");
    setOrders(d);
    const n: Record<string, string> = {};
    for (const o of d) {
      n[o.id] = o.adminNote ?? "";
    }
    setNotes(n);
    const drafts: Record<string, { productId: string; quantity: number }[]> = {};
    for (const o of d) {
      drafts[o.id] = o.items.map((it) => ({ productId: it.product.id, quantity: it.quantity }));
    }
    setItemDrafts(drafts);
    setLineErrors({});
  }

  async function load() {
    const res = await adminFetchJson<Order[]>("/api/admin/orders");
    applyOrdersFetch(res);
  }

  useEffect(() => {
    const id = ++loadGen.current;
    void adminFetchJson<Order[]>("/api/admin/orders")
      .then((res) => {
        if (loadGen.current !== id) return;
        applyOrdersFetch(res);
      })
      .finally(() => {
        if (loadGen.current === id) setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    if (filter === FILTER_ALL) return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  /** Units summed across all PENDING orders, highest quantity first. */
  const resumenPendientes = useMemo(() => {
    const pendientes = orders.filter((o) => o.status === "PENDIENTE");
    const porProducto = new Map<string, { nombre: string; unidades: number }>();
    for (const o of pendientes) {
      for (const it of o.items) {
        const id = it.product?.id ?? it.product?.name ?? "—";
        const nombre = it.product?.name ?? "Producto";
        const prev = porProducto.get(id);
        porProducto.set(id, {
          nombre,
          unidades: (prev?.unidades ?? 0) + it.quantity,
        });
      }
    }
    return [...porProducto.entries()]
      .map(([id, v]) => ({ id, nombre: v.nombre, unidades: v.unidades }))
      .sort((a, b) => b.unidades - a.unidades);
  }, [orders]);

  const hayPedidosPendientes = useMemo(
    () => orders.some((o) => o.status === "PENDIENTE"),
    [orders],
  );

  async function setStatus(id: string, status: string) {
    await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  async function saveNote(id: string) {
    await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminNote: notes[id] ?? "" }),
    });
    await load();
  }

  async function saveOrderLines(orderId: string) {
    const raw = itemDrafts[orderId] ?? [];
    const merged = mergeOrderLines(raw);
    if (merged.length === 0) {
      setLineErrors((prev) => ({
        ...prev,
        [orderId]: "Debe quedar al menos un producto con cantidad mayor que 0.",
      }));
      return;
    }
    setLineErrors((prev) => ({ ...prev, [orderId]: "" }));
    setSavingLinesId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: merged }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLineErrors((prev) => ({
          ...prev,
          [orderId]: typeof data.error === "string" ? data.error : "No se pudieron guardar las líneas",
        }));
        return;
      }
      await load();
    } finally {
      setSavingLinesId(null);
    }
  }

  async function acceptOrder(id: string) {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept: true }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "No se pudo aceptar el pedido");
      return;
    }
    await load();
  }

  if (loading) {
    return <p className="text-[var(--muted)]">Cargando pedidos…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Pedidos</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Filtra por estado, actualiza el flujo y añade notas internas (solo administración). En pedidos{" "}
        <strong>pendientes</strong> puedes corregir cantidades o quitar líneas si no tienes todo el producto; el total
        se recalcula con los precios actuales del catálogo.
      </p>
      {loadError ? (
        <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {loadError}{" "}
          <button
            type="button"
            className="text-[var(--accent)] underline"
            onClick={() => {
              setLoading(true);
              setLoadError("");
              void load().finally(() => setLoading(false));
            }}
          >
            Reintentar
          </button>
        </p>
      ) : null}

      <section className="mt-8 rounded-xl border border-amber-500/25 bg-amber-950/20 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200/90">
          Productos en pedidos pendientes
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Unidades totales en pedidos en estado pendiente, de mayor a menor.
        </p>
        {!hayPedidosPendientes ? (
          <p className="mt-4 text-sm text-[var(--muted)]">No hay pedidos pendientes.</p>
        ) : resumenPendientes.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Los pedidos pendientes no tienen líneas.</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {resumenPendientes.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              >
                <span className="font-medium text-[var(--text)]">{row.nombre}</span>
                <span className="shrink-0 tabular-nums text-amber-200/90">
                  {row.unidades} {row.unidades === 1 ? "unidad" : "unidades"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={filterChipClass(f, filter === f)}
          >
            {f === FILTER_ALL ? "Todos" : formatOrderStatus(f)}
          </button>
        ))}
      </div>

      <ul className="mt-8 space-y-6">
        {filtered.map((o) => (
          <li
            key={o.id}
            className={`rounded-xl border p-5 ${getOrderStatusUi(o.status).card}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium">{o.user.name}</p>
                <p className="text-sm text-[var(--muted)]">{o.user.email}</p>
                {(() => {
                  const c = resolveOrderContact(o, o.user);
                  return (
                    <dl className="mt-3 space-y-1 rounded-lg border border-[var(--border)] bg-[var(--bg)]/40 px-3 py-2 text-sm">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="text-[var(--muted)]">Teléfono</dt>
                        <dd className="min-w-0 break-words text-[var(--text)]">{c.phone ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Dirección de entrega</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap break-words text-[var(--text)]">
                          {c.address ?? "—"}
                        </dd>
                      </div>
                    </dl>
                  );
                })()}
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {new Date(o.createdAt).toLocaleString(APP_LOCALE, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">ID: {o.id}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className="font-semibold">{formatCents(o.totalCents)}</p>
                <Link
                  href={`/admin/pedidos/${o.id}/imprimir`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  Imprimir
                </Link>
                <select
                  value={o.status}
                  onChange={(e) => setStatus(o.id, e.target.value)}
                  className={`rounded-lg bg-[var(--bg)] px-2 py-1 text-sm ${getOrderStatusUi(o.status).select}`}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {formatOrderStatus(s)}
                    </option>
                  ))}
                </select>
                {o.status === "PENDIENTE" && !o.acceptedAt ? (
                  <button
                    type="button"
                    onClick={() => void acceptOrder(o.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                  >
                    Aceptar pedido
                  </button>
                ) : null}
                {o.status === "PENDIENTE" && o.acceptedAt ? (
                  <span className="text-xs text-emerald-700">Tienda aceptó — el cliente ya no puede editar</span>
                ) : null}
              </div>
            </div>
            <ul className="mt-4 space-y-1 border-t border-[var(--border)] pt-4 text-sm text-[var(--muted)]">
              {o.items.map((it, i) => (
                <li key={i}>
                  {it.product.name} × {it.quantity} — {formatCents(it.priceCents * it.quantity)}
                </li>
              ))}
            </ul>
            {o.status === "PENDIENTE" ? (
              <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg)]/50 p-4">
                <p className="text-xs font-medium text-[var(--muted)]">Editar líneas del pedido</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  Cambia cantidades o quita productos que no puedas surtir. No combines con cancelar ni con aceptar en
                  el mismo guardado.
                </p>
                <ul className="mt-3 space-y-2">
                  {(itemDrafts[o.id] ?? o.items.map((it) => ({ productId: it.product.id, quantity: it.quantity }))).map(
                    (line, idx) => {
                      const name =
                        o.items.find((it) => it.product.id === line.productId)?.product.name ?? line.productId;
                      return (
                        <li key={`${line.productId}-${idx}`} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate text-[var(--text)]">{name}</span>
                          <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
                            Cant.
                            <input
                              type="number"
                              min={1}
                              max={MAX_ORDER_LINE_QUANTITY}
                              value={line.quantity}
                              onChange={(e) => {
                                const q = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                setItemDrafts((prev) => {
                                  const list = [...(prev[o.id] ?? [])];
                                  const j = list.findIndex((l) => l.productId === line.productId);
                                  if (j >= 0) list[j] = { ...list[j], quantity: q };
                                  return { ...prev, [o.id]: list };
                                });
                              }}
                              className="w-16 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[var(--text)]"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setItemDrafts((prev) => ({
                                ...prev,
                                [o.id]: (prev[o.id] ?? []).filter((l) => l.productId !== line.productId),
                              }))
                            }
                            className="shrink-0 text-xs text-red-400 hover:underline"
                          >
                            Quitar
                          </button>
                        </li>
                      );
                    },
                  )}
                </ul>
                {lineErrors[o.id] ? <p className="mt-2 text-sm text-red-400">{lineErrors[o.id]}</p> : null}
                <button
                  type="button"
                  disabled={savingLinesId === o.id}
                  onClick={() => void saveOrderLines(o.id)}
                  className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {savingLinesId === o.id ? "Guardando líneas…" : "Guardar cambios en líneas"}
                </button>
              </div>
            ) : null}
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Nota interna
              </label>
              <textarea
                value={notes[o.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [o.id]: e.target.value }))}
                placeholder="Comentarios solo para el equipo (no visibles para clientes)…"
                rows={2}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => saveNote(o.id)}
                className="mt-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
              >
                Guardar nota
              </button>
            </div>
          </li>
        ))}
      </ul>
      {filtered.length === 0 ? (
        <p className="mt-8 text-[var(--muted)]">
          Ningún pedido coincide con este filtro.
          {filter === FILTER_ALL && orders.length === 0 ? (
            <>
              {" "}
              Los pedidos llegan desde la{" "}
              <Link href="/tienda" className="text-[var(--accent)] underline">
                tienda pública
              </Link>
              ; en desarrollo puedes cargar datos con{" "}
              <code className="rounded bg-[var(--surface)] px-1 py-0.5 font-mono text-xs">
                npm run db:seed
              </code>
              .
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
