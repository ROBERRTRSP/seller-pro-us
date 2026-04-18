"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetchJson } from "@/lib/admin-client-fetch";
import { formatCents } from "@/lib/money";
import { ProductPhotoUpload } from "@/components/ProductPhotoUpload";
import { MAX_PROMO_BADGE_LEN } from "@/lib/product-field-limits";
import { isOutOfStock, isUnlimitedStock, UNLIMITED_STOCK } from "@/lib/product-stock";
import { isTrustedOperatorUploadImageUrl, requiresExternalImageVerification } from "@/lib/product-image";

type CategoryOption = { id: string; name: string; sortOrder: number };

type Product = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  /** Costo de compra; solo admin. */
  costCents?: number | null;
  compareAtPriceCents: number | null;
  promoBadge: string | null;
  category: CategoryOption | null;
  stock: number;
  imageUrl: string | null;
  imagePending: boolean;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  size?: string | null;
  packSize?: string | null;
  sourceUrl?: string | null;
  imageStatus?: string | null;
  ageRestricted?: boolean;
  minimumAge?: number | null;
  catalogPublished?: boolean;
};

const BADGE_PRESETS = ["", "Rollback", "Clearance", "Reduced price"];

/** Precio de venta sugerido = precio de compra + este margen (15 % sobre la compra). */
const SUGGESTED_MARKUP_ON_COST = 0.15;

function dollarsFromCents(cents: number | null) {
  if (cents == null || cents <= 0) return "";
  return (cents / 100).toFixed(2);
}

function parseDollarsToCents(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Math.round(parseFloat(t) * 100);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Precio de compra: permite 0; vacío → null (solo edición). */
function dollarsFromPurchaseCents(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function parseCostDollarsToCents(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Math.round(parseFloat(t) * 100);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function suggestedSaleCentsFromCostCents(costCents: number): number {
  return Math.round(costCents * (1 + SUGGESTED_MARKUP_ON_COST));
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function AdminProductosPage() {
  const [list, setList] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    priceDollars: "",
    costDollars: "",
    compareAtDollars: "",
    promoBadge: "",
    categoryId: "",
    stock: "99",
    unlimitedStock: false,
    imageUrl: "",
    imageVerified: false,
  });
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    priceDollars: "",
    costDollars: "",
    compareAtDollars: "",
    promoBadge: "",
    categoryId: "",
    stock: "0",
    unlimitedStock: false,
    imageUrl: "",
    imageVerified: false,
    catalogPublished: true,
    sourceUrl: "",
  });
  const [listSearch, setListSearch] = useState("");

  const suggestedNewProductSale = useMemo(() => {
    const c = parseCostDollarsToCents(form.costDollars);
    if (c == null) return null;
    const saleCents = suggestedSaleCentsFromCostCents(c);
    return { saleCents, saleDollars: (saleCents / 100).toFixed(2) };
  }, [form.costDollars]);

  const suggestedEditSale = useMemo(() => {
    const c = parseCostDollarsToCents(editForm.costDollars);
    if (c == null) return null;
    const saleCents = suggestedSaleCentsFromCostCents(c);
    return { saleCents, saleDollars: (saleCents / 100).toFixed(2) };
  }, [editForm.costDollars]);

  const filteredList = useMemo(() => {
    const q = normalizeSearchText(listSearch);
    const base =
      !q
        ? list
        : list.filter((p) => {
            const haystack = normalizeSearchText(
              `${p.name} ${p.description} ${p.category?.name ?? ""} ${p.promoBadge ?? ""} ${p.sku ?? ""} ${p.barcode ?? ""} ${p.brand ?? ""} ${p.sourceUrl ?? ""}`,
            );
            return haystack.includes(q);
          });
    if (!editingId || base.some((p) => p.id === editingId)) return base;
    const current = list.find((p) => p.id === editingId);
    return current ? [current, ...base] : base;
  }, [list, listSearch, editingId]);

  async function load() {
    const [pr, cr] = await Promise.all([
      adminFetchJson<Product[]>("/api/admin/products"),
      adminFetchJson<(CategoryOption & { _count?: unknown })[]>("/api/admin/categories"),
    ]);
    if (!pr.ok || !cr.ok) {
      const parts = [!pr.ok ? pr.error : null, !cr.ok ? cr.error : null].filter(Boolean);
      setError(parts.length ? parts.join(" · ") : "No se pudieron cargar los datos");
      setList([]);
      setCategories([]);
      return;
    }
    const products = pr.data;
    const cats = cr.data;
    if (Array.isArray(products)) setList(products);
    if (Array.isArray(cats)) {
      setCategories(
        cats.map((c) => ({
          id: c.id,
          name: c.name,
          sortOrder: c.sortOrder,
        })),
      );
    }
  }

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);

  function openEdit(p: Product) {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      description: p.description,
      priceDollars: dollarsFromCents(p.priceCents),
      costDollars: dollarsFromPurchaseCents(p.costCents ?? null),
      compareAtDollars: dollarsFromCents(p.compareAtPriceCents),
      promoBadge: p.promoBadge ?? "",
      categoryId: p.category?.id ?? "",
      stock: isUnlimitedStock(p.stock) ? "99" : String(p.stock),
      unlimitedStock: isUnlimitedStock(p.stock),
      imageUrl: p.imageUrl ?? "",
      imageVerified: false,
      catalogPublished: p.catalogPublished !== false,
      sourceUrl: p.sourceUrl ?? "",
    });
    setError("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setError("");
    const ext = editForm.imageUrl.trim();
    if (requiresExternalImageVerification(ext) && !editForm.imageVerified) {
      setError(
        "Solo si pegas un enlace externo (no una foto subida arriba): marca la casilla confirmando marca, tipo y presentación.",
      );
      return;
    }
    const priceCents = Math.round(parseFloat(editForm.priceDollars.replace(",", ".")) * 100) || 0;
    const costTrim = editForm.costDollars.trim();
    let costCents: number | null;
    if (!costTrim) {
      costCents = null;
    } else {
      const c = Math.round(parseFloat(costTrim.replace(",", ".")) * 100);
      if (!Number.isFinite(c) || c < 0) {
        setError("El precio de compra no es válido.");
        return;
      }
      costCents = c;
    }
    const compareAtPriceCents = parseDollarsToCents(editForm.compareAtDollars);
    if (compareAtPriceCents != null && compareAtPriceCents <= priceCents) {
      setError("El precio «antes» debe ser mayor que el precio actual.");
      return;
    }
    setEditSaving(true);
    try {
      const stock = editForm.unlimitedStock
        ? UNLIMITED_STOCK
        : Math.max(0, Math.floor(Number(editForm.stock) || 0));
      const res = await fetch(`/api/admin/products/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          priceCents,
          costCents,
          compareAtPriceCents,
          promoBadge: editForm.promoBadge.trim() || null,
          categoryId: editForm.categoryId.trim() || null,
          stock,
          unlimitedStock: editForm.unlimitedStock,
          imageUrl: editForm.imageUrl.trim() || null,
          imageVerified: editForm.imageVerified,
          catalogPublished: editForm.catalogPublished,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar");
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setEditSaving(false);
    }
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const extNew = form.imageUrl.trim();
    if (requiresExternalImageVerification(extNew) && !form.imageVerified) {
      setError(
        "Solo si pegas un enlace externo: marca la casilla confirmando marca, tipo y presentación. Si usas «Hacer o elegir foto», no hace falta. También puedes crear el producto con foto pendiente (sin imagen).",
      );
      return;
    }
    const priceCents = Math.round(parseFloat(form.priceDollars.replace(",", ".")) * 100) || 0;
    const costTrim = form.costDollars.trim();
    if (!costTrim) {
      setError("Indica el precio de compra.");
      return;
    }
    const costCents = Math.round(parseFloat(costTrim.replace(",", ".")) * 100);
    if (!Number.isFinite(costCents) || costCents < 0) {
      setError("El precio de compra no es válido.");
      return;
    }
    const compareAtPriceCents = parseDollarsToCents(form.compareAtDollars);
    if (compareAtPriceCents != null && compareAtPriceCents <= priceCents) {
      setError("El precio «antes» debe ser mayor que el precio actual.");
      return;
    }
    setCreating(true);
    try {
      const stock = form.unlimitedStock ? UNLIMITED_STOCK : Math.max(0, Math.floor(Number(form.stock) || 0));
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          priceCents,
          costCents,
          compareAtPriceCents,
          promoBadge: form.promoBadge.trim() || null,
          categoryId: form.categoryId.trim() || null,
          stock,
          unlimitedStock: form.unlimitedStock,
          imageUrl: form.imageUrl.trim() || null,
          imageVerified: form.imageVerified,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear");
        return;
      }
      setForm({
        name: "",
        description: "",
        priceDollars: "",
        costDollars: "",
        compareAtDollars: "",
        promoBadge: "",
        categoryId: "",
        stock: "99",
        unlimitedStock: false,
        imageUrl: "",
        imageVerified: false,
      });
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este producto?")) return;
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    if (editingId === id) setEditingId(null);
    await load();
  }

  if (loading) {
    return <p className="text-[var(--muted)]">Cargando…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Productos</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Puedes publicar con <strong>foto pendiente</strong> (sin inventar imágenes). Para mostrar foto en
        la tienda: sube archivo o pega URL directa (.jpg, .png, …) y confirma que coincide en marca,
        tipo y presentación. Opcional: precio «antes», distintivo (Rollback, etc.) y{" "}
        <Link href="/admin/categorias" className="text-[var(--accent)] hover:underline">
          categoría
        </Link>
        .
      </p>

      <form
        onSubmit={createProduct}
        className="mt-8 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <h2 className="text-sm font-medium text-[var(--muted)]">Producto nuevo</h2>
        <input
          required
          placeholder="Nombre"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Descripción"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="min-h-[72px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--muted)]">
            Categoría
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            >
              <option value="">Ninguna (Otros en la tienda)</option>
              {[...categories]
                .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Distintivo (opcional)
            <input
              list="promo-badges-new"
              placeholder="Rollback, Oferta…"
              maxLength={MAX_PROMO_BADGE_LEN}
              value={form.promoBadge}
              onChange={(e) => setForm((f) => ({ ...f, promoBadge: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
            <datalist id="promo-badges-new">
              {BADGE_PRESETS.filter(Boolean).map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
        </div>
        <ProductPhotoUpload
          inputId="admin-new-product-photo"
          value={form.imageUrl}
          onChange={(url) => setForm((f) => ({ ...f, imageUrl: url, imageVerified: false }))}
          disabled={creating}
        />
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          placeholder={
            isTrustedOperatorUploadImageUrl(form.imageUrl)
              ? "Foto subida arriba. «Quitar imagen» si quieres pegar un enlace."
              : "URL directa a imagen (opcional; sin URL = foto pendiente)"
          }
          value={isTrustedOperatorUploadImageUrl(form.imageUrl) ? "" : form.imageUrl}
          readOnly={isTrustedOperatorUploadImageUrl(form.imageUrl)}
          onChange={(e) => {
            const v = e.target.value;
            setForm((f) => {
              if (isTrustedOperatorUploadImageUrl(f.imageUrl)) return f;
              return { ...f, imageUrl: v, imageVerified: false };
            });
          }}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm read-only:cursor-default read-only:opacity-90"
        />
        {requiresExternalImageVerification(form.imageUrl) ? (
          <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={form.imageVerified}
              onChange={(e) => setForm((f) => ({ ...f, imageVerified: e.target.checked }))}
              className="mt-0.5 shrink-0"
            />
            <span>
              Confirmo que esta <strong>URL</strong> coincide en <strong>marca</strong>, tipo de
              producto y presentación (solo enlaces pegados aquí, no fotos subidas con la cámara).
            </span>
          </label>
        ) : form.imageUrl.trim() ? (
          <p className="text-xs font-medium text-emerald-600/95">
            Foto subida: puedes guardar sin marcar la casilla anterior.
          </p>
        ) : null}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            <input
              required
              type="text"
              inputMode="decimal"
              placeholder="Precio de compra ($)"
              aria-label="Precio de compra en dólares"
              value={form.costDollars}
              onChange={(e) => setForm((f) => ({ ...f, costDollars: e.target.value }))}
              className="w-40 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
            <input
              required
              type="text"
              inputMode="decimal"
              placeholder="Precio actual ($)"
              value={form.priceDollars}
              onChange={(e) => setForm((f) => ({ ...f, priceDollars: e.target.value }))}
              className="w-36 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Precio «antes» ($), opcional"
              value={form.compareAtDollars}
              onChange={(e) => setForm((f) => ({ ...f, compareAtDollars: e.target.value }))}
              className="w-44 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
            <div className="text-xs text-[var(--muted)] sm:self-end">
              <p>Existencias (uds.)</p>
              <label className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.unlimitedStock}
                  onChange={(e) => setForm((f) => ({ ...f, unlimitedStock: e.target.checked }))}
                />
                Stock ilimitado
              </label>
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                disabled={form.unlimitedStock}
                className="mt-1 block w-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
              />
            </div>
          </div>
          {suggestedNewProductSale ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
              <span>
                Venta sugerida (+15% sobre compra):{" "}
                <strong className="font-medium text-[var(--text)]">
                  {formatCents(suggestedNewProductSale.saleCents)}
                </strong>
              </span>
              <button
                type="button"
                disabled={creating}
                onClick={() =>
                  setForm((f) => ({ ...f, priceDollars: suggestedNewProductSale.saleDollars }))
                }
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                Usar como precio actual
              </button>
            </p>
          ) : null}
        </div>
        {error && !editingId ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {creating ? "Guardando…" : "Crear producto"}
        </button>
      </form>

      <div className="mt-10 border-t border-[var(--border)] pt-8">
        <h2 className="text-sm font-semibold text-[var(--text)]">Lista de productos</h2>
        <label htmlFor="admin-productos-buscar" className="sr-only">
          Buscar en la lista de productos
        </label>
        <div className="mt-3 flex gap-2">
          <input
            id="admin-productos-buscar"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Buscar por nombre, SKU, código de barras, categoría o distintivo…"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text)] outline-none ring-[var(--accent)]/25 placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2"
          />
          {listSearch.trim() ? (
            <button
              type="button"
              onClick={() => setListSearch("")}
              className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--muted)] hover:text-[var(--text)]"
            >
              Limpiar
            </button>
          ) : null}
        </div>
        {listSearch.trim() ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            {filteredList.length === 0
              ? "Ningún resultado."
              : `Mostrando ${filteredList.length} de ${list.length} productos.`}
          </p>
        ) : (
          <p className="mt-2 text-xs text-[var(--muted)]">{list.length} productos en total.</p>
        )}
      </div>

      <ul className="mt-4 space-y-4">
        {filteredList.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 gap-3">
                {!p.imagePending && p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-amber-500/40 bg-amber-950/25 px-0.5 text-center text-[9px] font-semibold leading-tight text-amber-100/95">
                    <span>Foto</span>
                    <span>pendiente</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatCents(p.priceCents)}
                    {p.costCents != null ? ` · Compra ${formatCents(p.costCents)}` : ""}
                    {p.compareAtPriceCents != null && p.compareAtPriceCents > p.priceCents
                      ? ` · Antes ${formatCents(p.compareAtPriceCents)}`
                      : ""}
                    {" · "}
                    {isUnlimitedStock(p.stock)
                      ? "Stock ilimitado"
                      : isOutOfStock(p.stock)
                        ? "Sin stock"
                        : `Existencias ${p.stock}`}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {[
                      p.category?.name,
                      p.promoBadge,
                      p.imagePending ? "Imagen pendiente" : null,
                      p.catalogPublished === false ? "Borrador (no visible en tienda)" : null,
                      p.ageRestricted && p.minimumAge ? `${p.minimumAge}+` : p.ageRestricted ? "Edad mínima" : null,
                      p.imageStatus === "pending-permission" ? "Imagen: permiso pendiente" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                  {p.sourceUrl ? (
                    <p className="mt-1 truncate text-[10px] text-[var(--muted)]">
                      Referencia:{" "}
                      <a
                        href={p.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent)] hover:underline"
                      >
                        {p.sourceUrl}
                      </a>
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => (editingId === p.id ? setEditingId(null) : openEdit(p))}
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  {editingId === p.id ? "Cerrar" : "Editar"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="text-sm text-red-400 hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </div>

            {editingId === p.id ? (
              <form onSubmit={saveEdit} className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="min-h-[64px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-[var(--muted)]">
                    Categoría
                    <select
                      value={editForm.categoryId}
                      onChange={(e) => setEditForm((f) => ({ ...f, categoryId: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                    >
                      <option value="">Ninguna (Otros en la tienda)</option>
                      {[...categories]
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-xs text-[var(--muted)]">
                    Distintivo (opcional)
                    <input
                      list="promo-badges-edit"
                      placeholder="Rollback, Oferta…"
                      maxLength={MAX_PROMO_BADGE_LEN}
                      value={editForm.promoBadge}
                      onChange={(e) => setEditForm((f) => ({ ...f, promoBadge: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                    />
                    <datalist id="promo-badges-edit">
                      {BADGE_PRESETS.filter(Boolean).map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </label>
                </div>
                <ProductPhotoUpload
                  inputId={editingId ? `admin-edit-product-${editingId}` : "admin-edit-product"}
                  value={editForm.imageUrl}
                  onChange={(url) => setEditForm((f) => ({ ...f, imageUrl: url, imageVerified: false }))}
                  disabled={editSaving}
                />
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder={
                    isTrustedOperatorUploadImageUrl(editForm.imageUrl)
                      ? "Foto subida arriba. «Quitar imagen» si quieres pegar un enlace."
                      : "URL directa a imagen (opcional)"
                  }
                  value={isTrustedOperatorUploadImageUrl(editForm.imageUrl) ? "" : editForm.imageUrl}
                  readOnly={isTrustedOperatorUploadImageUrl(editForm.imageUrl)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditForm((f) => {
                      if (isTrustedOperatorUploadImageUrl(f.imageUrl)) return f;
                      return { ...f, imageUrl: v, imageVerified: false };
                    });
                  }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm read-only:cursor-default read-only:opacity-90"
                />
                {requiresExternalImageVerification(editForm.imageUrl) ? (
                  <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={editForm.imageVerified}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, imageVerified: e.target.checked }))
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <span>
                      Confirmo que esta <strong>URL</strong> coincide en marca, tipo y presentación
                      (solo si pegaste enlace aquí, no si usaste cámara o galería).
                    </span>
                  </label>
                ) : editForm.imageUrl.trim() ? (
                  <p className="text-xs font-medium text-emerald-600/95">
                    Foto subida: puedes guardar sin marcar la casilla.
                  </p>
                ) : null}
                <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={editForm.catalogPublished}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, catalogPublished: e.target.checked }))
                    }
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    <strong>Visible en la tienda</strong> (requiere precio &gt; 0, foto verificada y URL
                    directa o subida). Desmarca para dejar en borrador.
                  </span>
                </label>
                {editForm.sourceUrl ? (
                  <p className="text-[11px] text-[var(--muted)]">
                    URL de referencia (solo lectura en este formulario):{" "}
                    <a
                      href={editForm.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-[var(--accent)] hover:underline"
                    >
                      {editForm.sourceUrl}
                    </a>
                  </p>
                ) : null}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Precio de compra ($), opcional"
                      aria-label="Precio de compra en dólares"
                      value={editForm.costDollars}
                      onChange={(e) => setEditForm((f) => ({ ...f, costDollars: e.target.value }))}
                      className="w-44 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                    />
                    <input
                      required
                      type="text"
                      inputMode="decimal"
                      placeholder="Precio actual ($)"
                      value={editForm.priceDollars}
                      onChange={(e) => setEditForm((f) => ({ ...f, priceDollars: e.target.value }))}
                      className="w-36 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Precio «antes» ($)"
                      value={editForm.compareAtDollars}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, compareAtDollars: e.target.value }))
                      }
                      className="w-44 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                    />
                    <div className="text-xs text-[var(--muted)] sm:self-end">
                      <p>Existencias (uds.)</p>
                      <label className="mt-1 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editForm.unlimitedStock}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, unlimitedStock: e.target.checked }))
                          }
                        />
                        Stock ilimitado
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={editForm.stock}
                        onChange={(e) => setEditForm((f) => ({ ...f, stock: e.target.value }))}
                        disabled={editForm.unlimitedStock}
                        className="mt-1 block w-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                      />
                    </div>
                  </div>
                  {suggestedEditSale ? (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
                      <span>
                        Venta sugerida (+15% sobre compra):{" "}
                        <strong className="font-medium text-[var(--text)]">
                          {formatCents(suggestedEditSale.saleCents)}
                        </strong>
                      </span>
                      <button
                        type="button"
                        disabled={editSaving}
                        onClick={() =>
                          setEditForm((f) => ({ ...f, priceDollars: suggestedEditSale.saleDollars }))
                        }
                        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
                      >
                        Usar como precio actual
                      </button>
                    </p>
                  ) : null}
                </div>
                {error && editingId ? <p className="text-sm text-red-400">{error}</p> : null}
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {editSaving ? "Guardando…" : "Guardar cambios"}
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
