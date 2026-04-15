"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ADMIN_FETCH_TIMEOUT, adminFetchJson, type AdminFetchJsonResult } from "@/lib/admin-client-fetch";
import { formatCents } from "@/lib/money";
import { APP_LOCALE, formatOrderStatus } from "@/lib/us-locale";

type Order = {
  id: string;
  status: string;
  acceptedAt: string | null;
  totalCents: number;
  createdAt: string;
  adminNote: string | null;
  user: { email: string; name: string };
  items: { quantity: number; priceCents: number; product: { id: string; name: string } }[];
};

const STATUSES = ["PENDIENTE", "ENVIADO", "COMPLETADO", "CANCELADO"] as const;
const FILTER_ALL = "ALL" as const;
const FILTERS = [FILTER_ALL, ...STATUSES] as const;

export default function AdminPedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(FILTER_ALL);
  const [notes, setNotes] = useState<Record<string, string>>({});
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
        Filtra por estado, actualiza el flujo y añade notas internas (solo administración).
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
            className={`rounded-full px-3 py-1 text-sm ${
              filter === f
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {f === FILTER_ALL ? "Todos" : formatOrderStatus(f)}
          </button>
        ))}
      </div>

      <ul className="mt-8 space-y-6">
        {filtered.map((o) => (
          <li
            key={o.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium">{o.user.name}</p>
                <p className="text-sm text-[var(--muted)]">{o.user.email}</p>
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
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
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
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
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
