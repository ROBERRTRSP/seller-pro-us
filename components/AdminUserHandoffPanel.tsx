"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import type { AdminUserListRow } from "@/lib/admin-user-types";
import { APP_LOCALE, formatOrderStatus } from "@/lib/us-locale";

export type HandoffPayload = {
  user: {
    id: string;
    name: string;
    email: string;
    role: "CLIENT" | "ADMIN";
    createdAt: string;
  };
  orderCount: number;
  recentOrders: {
    id: string;
    status: string;
    totalCents: number;
    createdAt: string;
    lineCount: number;
  }[];
  shopMagicUrl: string | null;
  shopMagicExpiresAt: string | null;
};

type UserPatch = Partial<{
  name: string;
  role: "CLIENT" | "ADMIN";
  email: string;
  password: string;
  phone: string | null;
  address: string | null;
  businessLicense: string | null;
  tobaccoLicense: string | null;
}>;

type Props = {
  user: AdminUserListRow;
  onClose: () => void;
  onReload: () => Promise<void>;
  updateUser: (id: string, patch: UserPatch) => Promise<boolean>;
  enterAsClient: (userId: string) => void;
  deleteClientAccount: (u: AdminUserListRow) => void;
  pwdDraft: Record<string, string>;
  setPwdDraft: Dispatch<SetStateAction<Record<string, string>>>;
  pwdSaving: string | null;
  savePassword: (userId: string) => void;
  deletingId: string | null;
};

export function AdminUserHandoffPanel({
  user,
  onClose,
  onReload,
  updateUser,
  enterAsClient,
  deleteClientAccount,
  pwdDraft,
  setPwdDraft,
  pwdSaving,
  savePassword,
  deletingId,
}: Props) {
  const [data, setData] = useState<HandoffPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/users/${user.id}/handoff`, { method: "POST" });
      const j = (await r.json().catch(() => null)) as HandoffPayload | { error?: string } | null;
      if (!r.ok) {
        setError(typeof (j as { error?: string })?.error === "string" ? (j as { error: string }).error : "Error al cargar");
        return;
      }
      if (!j || !("user" in j)) {
        setError("Respuesta inválida");
        return;
      }
      setData(j as HandoffPayload);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const url = data?.shopMagicUrl;
    if (!url) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void import("qrcode")
      .then((QR) =>
        QR.default.toDataURL(url, {
          width: 200,
          margin: 2,
          color: { dark: "#0a0a0a", light: "#ffffff" },
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.shopMagicUrl]);

  async function copyLink() {
    const url = data?.shopMagicUrl;
    if (!url || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const uid = user.id;

  return (
    <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Editar usuario</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Cambios al salir de cada campo o con Guardar en contraseña. Cierra cuando termines.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg)]"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-5 space-y-6">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Identidad y acceso</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-[var(--muted)]">
              Nombre
              <input
                key={`name-${uid}-${user.name}`}
                defaultValue={user.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== user.name) void updateUser(uid, { name: v }).then((ok) => ok && void onReload());
                }}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
              />
            </label>
            <label className="block text-xs text-[var(--muted)]">
              Correo
              <input
                type="email"
                key={`email-${uid}-${user.email}`}
                defaultValue={user.email}
                onBlur={(e) => {
                  const v = e.target.value.trim().toLowerCase();
                  if (v && v !== user.email) void updateUser(uid, { email: v }).then((ok) => ok && void onReload());
                }}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm text-[var(--text)]"
              />
            </label>
            <label className="block text-xs text-[var(--muted)]">
              Rol
              <select
                value={user.role}
                onChange={(e) =>
                  void updateUser(uid, { role: e.target.value as "CLIENT" | "ADMIN" }).then((ok) => ok && void onReload())
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              >
                <option value="CLIENT">Cliente</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </label>
            <div>
              <span className="text-xs text-[var(--muted)]">Nueva contraseña</span>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mín. 6 caracteres"
                  value={pwdDraft[uid] ?? ""}
                  onChange={(e) => setPwdDraft((d) => ({ ...d, [uid]: e.target.value }))}
                  className="min-w-[140px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={pwdSaving === uid}
                  onClick={() => void savePassword(uid)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
                >
                  {pwdSaving === uid ? "…" : "Guardar contraseña"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {user.role === "CLIENT" ? (
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Entrega y licencias</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-[var(--muted)] sm:col-span-2">
                Teléfono
                <input
                  type="text"
                  inputMode="tel"
                  key={`phone-${uid}-${user.phone ?? ""}`}
                  defaultValue={user.phone ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    const prev = (user.phone ?? "").trim();
                    if (v !== prev) void updateUser(uid, { phone: v || null }).then((ok) => ok && void onReload());
                  }}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--muted)] sm:col-span-2">
                Dirección
                <textarea
                  key={`addr-${uid}-${user.address ?? ""}`}
                  defaultValue={user.address ?? ""}
                  rows={3}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    const prev = (user.address ?? "").trim();
                    if (v !== prev) void updateUser(uid, { address: v || null }).then((ok) => ok && void onReload());
                  }}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Business license
                <input
                  key={`bl-${uid}-${user.businessLicense ?? ""}`}
                  defaultValue={user.businessLicense ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    const prev = (user.businessLicense ?? "").trim();
                    if (v !== prev) void updateUser(uid, { businessLicense: v || null }).then((ok) => ok && void onReload());
                  }}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Tobacco license
                <input
                  key={`tl-${uid}-${user.tobaccoLicense ?? ""}`}
                  defaultValue={user.tobaccoLicense ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    const prev = (user.tobaccoLicense ?? "").trim();
                    if (v !== prev) void updateUser(uid, { tobaccoLicense: v || null }).then((ok) => ok && void onReload());
                  }}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>
        ) : null}

        <section className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
          {user.role === "CLIENT" ? (
            <>
              <button
                type="button"
                onClick={() => enterAsClient(uid)}
                className="rounded-lg border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/25"
              >
                Abrir tienda como este cliente
              </button>
              <button
                type="button"
                disabled={deletingId === uid}
                onClick={() => deleteClientAccount(user)}
                className="rounded-lg border border-red-500/45 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-950/50 disabled:opacity-50"
              >
                {deletingId === uid ? "Eliminando…" : "Eliminar cuenta"}
              </button>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Los administradores no tienen sesión en la tienda ni QR.</p>
          )}
        </section>

        {user.role === "CLIENT" ? (
          <section className="border-t border-[var(--border)] pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">QR · enlace mágico (~15 min)</h3>
              <button
                type="button"
                disabled={loading}
                onClick={() => void load()}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:border-[var(--accent)] disabled:opacity-50"
              >
                Regenerar
              </button>
            </div>
            {loading ? <p className="mt-3 text-sm text-[var(--muted)]">Cargando QR…</p> : null}
            {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
            {data && !loading && data.shopMagicUrl && qrDataUrl ? (
              <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="" width={200} height={200} className="rounded-lg border border-[var(--border)] bg-white p-2" />
                <div className="max-w-md space-y-2 text-xs text-[var(--muted)]">
                  <p>El cliente escanea e inicia sesión en la tienda.</p>
                  {data.shopMagicExpiresAt ? (
                    <p>
                      Caduca:{" "}
                      {new Date(data.shopMagicExpiresAt).toLocaleString(APP_LOCALE, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)]"
                  >
                    {copied ? "Copiado" : "Copiar enlace"}
                  </button>
                </div>
              </div>
            ) : null}
            {data && !loading && !data.shopMagicUrl ? (
              <p className="mt-3 text-sm text-[var(--muted)]">No hay enlace (revisa AUTH_SECRET).</p>
            ) : null}
          </section>
        ) : null}

        <section className="border-t border-[var(--border)] pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Pedidos {data ? `(${data.orderCount})` : `(${user._count.orders})`}
          </h3>
          {loading ? (
            <p className="mt-2 text-sm text-[var(--muted)]">…</p>
          ) : data && data.recentOrders.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">Sin pedidos aún.</p>
          ) : data && data.recentOrders.length > 0 ? (
            <ul className="mt-3 divide-y divide-[var(--border)]/60 rounded-lg border border-[var(--border)]">
              {data.recentOrders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-sm">
                  <span className="text-[var(--text)]">
                    {new Date(o.createdAt).toLocaleString(APP_LOCALE, { dateStyle: "short", timeStyle: "short" })} ·{" "}
                    {formatOrderStatus(o.status)}
                  </span>
                  <span className="font-semibold text-[var(--text)]">{formatCents(o.totalCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">—</p>
          )}
        </section>
      </div>
    </div>
  );
}
