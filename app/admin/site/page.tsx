"use client";

import { useEffect, useState } from "react";
import { ADMIN_FETCH_TIMEOUT, adminFetchJson } from "@/lib/admin-client-fetch";
import type { SiteSettingsPublic } from "@/lib/site-settings-defaults";
import { DEFAULT_SITE_SETTINGS, EMPTY_SITE_SETTINGS } from "@/lib/site-settings-defaults";
import { APP_LOCALE } from "@/lib/us-locale";

const FIELDS: { key: keyof SiteSettingsPublic; label: string; hint?: string; multiline?: boolean }[] = [
  { key: "siteTitle", label: "Título del navegador (pestaña)", hint: "Aparece en buscadores y en la pestaña del navegador." },
  { key: "siteDescription", label: "Meta descripción del sitio", hint: "Resumen breve para resultados de búsqueda.", multiline: true },
  { key: "storeName", label: "Nombre de la tienda (cabecera)" },
  { key: "storefrontNotice", label: "Franja de aviso superior", hint: "Línea de política de pago o envío bajo el encabezado.", multiline: true },
  { key: "navBrowse", label: "Navegación: etiqueta Explorar" },
  { key: "navCart", label: "Navegación: etiqueta Carrito" },
  { key: "navOrders", label: "Navegación: etiqueta Mis pedidos" },
  { key: "heroEyebrow", label: "Inicio — línea pequeña sobre el título" },
  { key: "heroTitle", label: "Inicio — titular principal" },
  { key: "heroSubtitle", label: "Inicio — subtítulo" },
  { key: "heroBody", label: "Inicio — texto del cuerpo", multiline: true },
  { key: "heroCtaLabel", label: "Inicio — texto del botón principal" },
];

export default function AdminSitePage() {
  const [form, setForm] = useState<SiteSettingsPublic>({ ...EMPTY_SITE_SETTINGS });
  const [minimumOrderDollars, setMinimumOrderDollars] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    void adminFetchJson<
      SiteSettingsPublic & { minimumOrderCents?: number; updatedAt?: string | null }
    >("/api/admin/site-settings").then(
      (res) => {
        if (!res.ok) {
          setError(
            res.error === ADMIN_FETCH_TIMEOUT
              ? "Tiempo de espera agotado. Comprueba el servidor e inténtalo de nuevo."
              : res.error,
          );
          return;
        }
        const d = res.data;
        if (d && typeof d === "object" && "storeName" in d) {
          const { updatedAt: u, minimumOrderCents, ...rest } = d;
          setForm(rest as SiteSettingsPublic);
          const minCents = Math.max(0, Math.floor(Number(minimumOrderCents) || 0));
          setMinimumOrderDollars((minCents / 100).toFixed(2));
          setUpdatedAt(u ?? null);
        }
      },
    ).finally(() => setLoading(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const normalized = minimumOrderDollars.trim().replace(",", ".");
    const parsed = Math.round((Number.parseFloat(normalized || "0") || 0) * 100);
    const minimumOrderCents = Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN;
    if (!Number.isFinite(minimumOrderCents) || minimumOrderCents < 0) {
      setError("El pedido mínimo debe ser un número válido mayor o igual a 0.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, minimumOrderCents }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar");
        return;
      }
      const { updatedAt: u, minimumOrderCents: m, ...rest } = data as SiteSettingsPublic & {
        minimumOrderCents?: number;
        updatedAt?: string | null;
      };
      setForm(rest as SiteSettingsPublic);
      const minCents = Math.max(0, Math.floor(Number(m) || 0));
      setMinimumOrderDollars((minCents / 100).toFixed(2));
      setUpdatedAt(u ?? null);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-[var(--muted)]">Cargando…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Tienda pública y sitio</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
        Textos de la tienda (cabecera, aviso, bloque principal) y metadatos del navegador. Deja un campo vacío para usar
        el valor por defecto (ver texto de ejemplo bajo cada campo).
      </p>
      {updatedAt ? (
        <p className="mt-2 text-xs text-[var(--muted)]">Último guardado: {new Date(updatedAt).toLocaleString(APP_LOCALE)}</p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-8 max-w-2xl space-y-5">
        <div>
          <label htmlFor="minimumOrderDollars" className="block text-sm font-medium text-[var(--muted)]">
            Pedido mínimo para confirmar (USD)
          </label>
          <input
            id="minimumOrderDollars"
            type="text"
            inputMode="decimal"
            value={minimumOrderDollars}
            onChange={(e) => setMinimumOrderDollars(e.target.value)}
            placeholder="0.00"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Si es 0.00, no hay mínimo. Se valida al confirmar pedido en el carrito.
          </p>
        </div>

        {FIELDS.map(({ key, label, hint, multiline }) => (
          <div key={key}>
            <label htmlFor={key} className="block text-sm font-medium text-[var(--muted)]">
              {label}
            </label>
            {multiline ? (
              <textarea
                id={key}
                rows={key === "heroBody" ? 5 : 3}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={(DEFAULT_SITE_SETTINGS as Record<string, string>)[key]}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
              />
            ) : (
              <input
                id={key}
                type="text"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={(DEFAULT_SITE_SETTINGS as Record<string, string>)[key]}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
              />
            )}
            {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
          </div>
        ))}

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </div>
  );
}
