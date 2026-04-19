"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ADMIN_FETCH_TIMEOUT, adminFetchJson } from "@/lib/admin-client-fetch";
import { MAX_CATEGORY_LEN } from "@/lib/product-field-limits";

type CategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  _count: { products: number };
};

export default function AdminCategoriasPage() {
  const [list, setList] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSort, setNewSort] = useState("");

  async function load() {
    const res = await adminFetchJson<CategoryRow[]>("/api/admin/categories");
    if (!res.ok) {
      setError(
        res.error === ADMIN_FETCH_TIMEOUT
          ? "Tiempo de espera agotado. Comprueba el servidor e inténtalo de nuevo."
          : res.error,
      );
      setList([]);
      return;
    }
    if (Array.isArray(res.data)) setList(res.data);
  }

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = newName.trim().slice(0, MAX_CATEGORY_LEN);
    if (!name) {
      setError("Escribe un nombre de categoría");
      return;
    }
    setCreating(true);
    try {
      const sortOrder = newSort.trim() === "" ? undefined : Number(newSort);
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(Number.isFinite(sortOrder) ? { sortOrder } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear");
        return;
      }
      setNewName("");
      setNewSort("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function updateRow(id: string, patch: Partial<{ name: string; sortOrder: number }>) {
    setError("");
    const res = await fetch(`/api/admin/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo actualizar");
      return;
    }
    await load();
  }

  async function remove(id: string) {
    if (
      !confirm(
        "¿Eliminar esta categoría? Los productos quedarán sin sección (aparecerán como «Otros» en la tienda).",
      )
    )
      return;
    setError("");
    const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar");
      return;
    }
    await load();
  }

  if (loading) {
    return <p className="text-[var(--muted)]">Cargando…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Categorías</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Secciones que se muestran en la tienda. Asigna productos en{" "}
        <Link href="/admin/productos" className="text-[var(--accent)] hover:underline">
          Productos
        </Link>
        . Un orden de clasificación menor aparece antes entre secciones.
      </p>

      <form
        onSubmit={create}
        className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <div>
          <label className="block text-xs font-medium text-[var(--muted)]">Nombre de la nueva categoría</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={MAX_CATEGORY_LEN}
            placeholder="p. ej. Temporada"
            className="mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)]">Orden (opcional)</label>
          <input
            type="number"
            value={newSort}
            onChange={(e) => setNewSort(e.target.value)}
            placeholder="Auto"
            className="mt-1 w-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {creating ? "Añadiendo…" : "Añadir categoría"}
        </button>
      </form>

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <div className="mt-10 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Orden</th>
              <th className="px-4 py-3 font-medium">Productos</th>
              <th className="px-4 py-3 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-b border-[var(--border)]/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex max-w-[min(100%,380px)] flex-wrap items-center gap-2">
                    <input
                      defaultValue={c.name}
                      key={`n-${c.id}-${c.name}`}
                      maxLength={MAX_CATEGORY_LEN}
                      onBlur={(e) => {
                        const v = e.target.value.trim().slice(0, MAX_CATEGORY_LEN);
                        if (v && v !== c.name) void updateRow(c.id, { name: v });
                      }}
                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-[var(--border)] focus:border-[var(--accent)]"
                    />
                    <Link
                      href={`/admin/productos?categoria=${encodeURIComponent(c.id)}`}
                      className="shrink-0 whitespace-nowrap rounded-md border border-[var(--accent)]/45 bg-[var(--accent)]/15 px-2 py-1 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/25"
                      title="Ver solo productos de esta categoría"
                    >
                      Ver productos
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    defaultValue={c.sortOrder}
                    key={`s-${c.id}-${c.sortOrder}`}
                    className="w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                    onBlur={(e) => {
                      const n = Math.floor(Number(e.target.value));
                      if (Number.isFinite(n) && n !== c.sortOrder) void updateRow(c.id, { sortOrder: n });
                    }}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/productos?categoria=${encodeURIComponent(c.id)}`}
                    className="inline-flex items-center gap-1 font-semibold tabular-nums text-[var(--accent)] hover:underline"
                    title="Ver productos de esta categoría"
                  >
                    {c._count.products}
                    <span aria-hidden className="text-[11px] opacity-80">
                      →
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void remove(c.id)}
                    className="text-sm text-red-400 hover:underline"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
