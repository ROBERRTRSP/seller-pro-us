"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
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

export function AdminUserHandoffPanel({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<HandoffPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/users/${userId}/handoff`, { method: "POST" });
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
  }, [userId]);

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
          width: 220,
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

  return (
    <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">QR e informe de cuenta</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
          >
            Regenerar enlace
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg)]"
          >
            Cerrar
          </button>
        </div>
      </div>

      {loading ? <p className="mt-4 text-sm text-[var(--muted)]">Cargando…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {data && !loading ? (
        <div className="mt-5 grid gap-8 lg:grid-cols-[auto,1fr] lg:items-start">
          <div className="flex flex-col items-center gap-3">
            {data.shopMagicUrl && qrDataUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="Código QR para iniciar sesión en la tienda"
                  width={220}
                  height={220}
                  className="rounded-lg border border-[var(--border)] bg-white p-2"
                />
                <p className="max-w-[260px] text-center text-xs text-[var(--muted)]">
                  El cliente escanea el código e inicia sesión en la tienda (pedidos y perfil). Válido ~15 minutos.
                </p>
                {data.shopMagicExpiresAt ? (
                  <p className="text-center text-[10px] text-[var(--muted)]">
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
              </>
            ) : (
              <div className="flex max-w-xs flex-col items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] px-6 py-8 text-center text-sm text-[var(--muted)]">
                <p>No se genera QR para cuentas de administrador.</p>
                <p className="mt-2 text-xs">Usa el panel de administración con tu sesión de admin.</p>
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Informe de cuenta
              </h3>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--muted)]">Nombre</dt>
                  <dd className="font-medium text-[var(--text)]">{data.user.name}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Correo</dt>
                  <dd className="break-all font-mono text-xs text-[var(--text)]">{data.user.email}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Rol</dt>
                  <dd className="text-[var(--text)]">
                    {data.user.role === "CLIENT" ? "Cliente" : "Administrador"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Alta</dt>
                  <dd className="text-[var(--text)]">
                    {new Date(data.user.createdAt).toLocaleDateString(APP_LOCALE, { dateStyle: "medium" })}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Pedidos totales</dt>
                  <dd className="text-2xl font-black text-[var(--accent)]">{data.orderCount}</dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Pedidos recientes
              </h3>
              {data.recentOrders.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Sin pedidos aún.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead className="bg-[var(--bg)] text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2 font-medium">Líneas</th>
                        <th className="px-3 py-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOrders.map((o) => (
                        <tr key={o.id} className="border-t border-[var(--border)]/60">
                          <td className="px-3 py-2 text-[var(--text)]">
                            {new Date(o.createdAt).toLocaleString(APP_LOCALE, {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </td>
                          <td className="px-3 py-2 text-[var(--text)]">{formatOrderStatus(o.status)}</td>
                          <td className="px-3 py-2 text-[var(--text)]">{o.lineCount}</td>
                          <td className="px-3 py-2 font-semibold text-[var(--text)]">
                            {formatCents(o.totalCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
