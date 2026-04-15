"use client";

import { useEffect, useState } from "react";
import { AdminUserHandoffPanel } from "@/components/AdminUserHandoffPanel";
import { ADMIN_FETCH_NETWORK, ADMIN_FETCH_TIMEOUT, adminFetchJson } from "@/lib/admin-client-fetch";
import { APP_LOCALE } from "@/lib/us-locale";
import { safeInternalPath } from "@/lib/safe-internal-path";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "CLIENT" | "ADMIN";
  phone: string | null;
  address: string | null;
  businessLicense: string | null;
  tobaccoLicense: string | null;
  createdAt: string;
  _count: { orders: number };
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

export default function AdminUsuariosPage() {
  const [list, setList] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [pwdDraft, setPwdDraft] = useState<Record<string, string>>({});
  const [pwdSaving, setPwdSaving] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "CLIENT" as "CLIENT" | "ADMIN",
    phone: "",
    address: "",
    businessLicense: "",
    tobaccoLicense: "",
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  async function load() {
    const res = await adminFetchJson<UserRow[]>("/api/admin/users");
    if (!res.ok) {
      if (res.error === ADMIN_FETCH_TIMEOUT) {
        setError("Tiempo de espera agotado. Comprueba el servidor e inténtalo de nuevo.");
      } else if (res.error === ADMIN_FETCH_NETWORK) {
        setError("No se pudo conectar con el servidor.");
      } else {
        setError(res.error || "No se pudieron cargar los usuarios");
      }
      setList([]);
      return;
    }
    if (Array.isArray(res.data)) setList(res.data);
  }

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el usuario");
        return;
      }
      setForm({
        email: "",
        password: "",
        name: "",
        role: "CLIENT",
        phone: "",
        address: "",
        businessLicense: "",
        tobaccoLicense: "",
      });
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function enterAsClient(userId: string) {
    setError("");
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "No se pudo abrir la vista de cliente");
      return;
    }
    window.location.href = safeInternalPath(data.redirect, "/tienda");
  }

  async function updateUser(id: string, patch: UserPatch): Promise<boolean> {
    setError("");
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo actualizar el usuario");
      return false;
    }
    await load();
    return true;
  }

  async function savePassword(userId: string) {
    const pwd = (pwdDraft[userId] ?? "").trim();
    if (pwd.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setPwdSaving(userId);
    setError("");
    try {
      const ok = await updateUser(userId, { password: pwd });
      if (ok) setPwdDraft((d) => ({ ...d, [userId]: "" }));
    } finally {
      setPwdSaving(null);
    }
  }

  if (loading) {
    return <p className="text-[var(--muted)]">Cargando…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Usuarios</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Crea cuentas, edita <strong>nombre, correo y contraseña</strong>, cambia el rol o{" "}
        <strong>abre la tienda como cliente</strong>. Los <strong>clientes ya creados</strong> pueden actualizar
        teléfono, dirección y licencias en la tabla (al salir del campo se guarda). Toca una fila (fuera de campos y
        botones) para ver <strong>código QR e informe</strong>.
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Para crear cuenta de <strong>Cliente</strong>: teléfono, dirección, Business License y Tobacco License son
        obligatorios.
      </p>

      <form
        onSubmit={createUser}
        className="mt-8 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <h2 className="text-sm font-medium text-[var(--muted)]">Nuevo usuario</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Correo"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
          <input
            required
            type="password"
            autoComplete="new-password"
            placeholder="Contraseña (mín. 6)"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
          <input
            required
            autoComplete="name"
            placeholder="Nombre visible"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
          <select
            value={form.role}
            onChange={(e) =>
              setForm((f) => ({ ...f, role: e.target.value as "CLIENT" | "ADMIN" }))
            }
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            aria-label="Rol"
          >
            <option value="CLIENT">Cliente</option>
            <option value="ADMIN">Administrador</option>
          </select>
          <input
            required={form.role === "CLIENT"}
            inputMode="tel"
            autoComplete="tel"
            placeholder="Teléfono (obligatorio para cliente)"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
          <label className="sm:col-span-2">
            <span className="sr-only">Dirección del cliente</span>
            <textarea
              required={form.role === "CLIENT"}
              autoComplete="street-address"
              placeholder="Dirección del cliente (calle, ciudad, estado, ZIP) — obligatoria para cliente"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </label>
          <input
            required={form.role === "CLIENT"}
            placeholder="Business License (obligatorio para cliente)"
            value={form.businessLicense}
            onChange={(e) => setForm((f) => ({ ...f, businessLicense: e.target.value }))}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
          <input
            required={form.role === "CLIENT"}
            placeholder="Tobacco License (obligatorio para cliente)"
            value={form.tobaccoLicense}
            onChange={(e) => setForm((f) => ({ ...f, tobaccoLicense: e.target.value }))}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {creating ? "Creando…" : "Crear usuario"}
        </button>
      </form>

      <div className="mt-10 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="min-w-[200px] px-4 py-3 font-medium">Nueva contraseña</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="min-w-[120px] px-4 py-3 font-medium">Teléfono</th>
              <th className="min-w-[180px] px-4 py-3 font-medium">Dirección</th>
              <th className="min-w-[120px] px-4 py-3 font-medium">Business lic.</th>
              <th className="min-w-[120px] px-4 py-3 font-medium">Tobacco lic.</th>
              <th className="px-4 py-3 font-medium">Pedidos</th>
              <th className="px-4 py-3 font-medium">Alta</th>
              <th className="px-4 py-3 font-medium">Tienda</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr
                key={u.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("input,button,select,textarea")) return;
                  setSelectedUserId(u.id);
                }}
                className={`cursor-pointer border-b border-[var(--border)]/60 last:border-0 hover:bg-[var(--bg)]/80 ${
                  selectedUserId === u.id ? "bg-[var(--accent)]/10" : ""
                }`}
              >
                <td className="px-4 py-3 align-top">
                  <input
                    defaultValue={u.name}
                    key={`name-${u.id}-${u.name}`}
                    placeholder="Nombre visible"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== u.name) void updateUser(u.id, { name: v });
                    }}
                    className="w-full max-w-[160px] rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-[var(--border)] focus:border-[var(--accent)]"
                  />
                </td>
                <td className="px-4 py-3 align-top">
                  <input
                    type="email"
                    defaultValue={u.email}
                    key={`email-${u.id}-${u.email}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim().toLowerCase();
                      if (v && v !== u.email) void updateUser(u.id, { email: v });
                    }}
                    className="w-full max-w-[220px] rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs hover:border-[var(--border)] focus:border-[var(--accent)]"
                  />
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Mín. 6 caracteres"
                      value={pwdDraft[u.id] ?? ""}
                      onChange={(e) => setPwdDraft((d) => ({ ...d, [u.id]: e.target.value }))}
                      className="min-w-[120px] flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      disabled={pwdSaving === u.id}
                      onClick={() => void savePassword(u.id)}
                      className="shrink-0 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
                    >
                      {pwdSaving === u.id ? "…" : "Guardar"}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <select
                    value={u.role}
                    onChange={(e) =>
                      void updateUser(u.id, { role: e.target.value as "CLIENT" | "ADMIN" })
                    }
                    className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
                  >
                    <option value="CLIENT">Cliente</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </td>
                <td className="px-4 py-3 align-top">
                  {u.role === "CLIENT" ? (
                    <input
                      type="text"
                      inputMode="tel"
                      autoComplete="tel"
                      defaultValue={u.phone ?? ""}
                      key={`phone-${u.id}-${u.phone ?? ""}`}
                      placeholder="Teléfono"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const prev = (u.phone ?? "").trim();
                        if (v !== prev) void updateUser(u.id, { phone: v || null });
                      }}
                      className="w-full max-w-[140px] rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                    />
                  ) : (
                    <span className="text-xs text-[var(--muted)]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {u.role === "CLIENT" ? (
                    <textarea
                      defaultValue={u.address ?? ""}
                      key={`addr-${u.id}-${u.address ?? ""}`}
                      placeholder="Dirección"
                      rows={2}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const prev = (u.address ?? "").trim();
                        if (v !== prev) void updateUser(u.id, { address: v || null });
                      }}
                      className="w-full max-w-[220px] resize-y rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                    />
                  ) : (
                    <span className="text-xs text-[var(--muted)]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {u.role === "CLIENT" ? (
                    <input
                      type="text"
                      defaultValue={u.businessLicense ?? ""}
                      key={`bl-${u.id}-${u.businessLicense ?? ""}`}
                      placeholder="Business License"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const prev = (u.businessLicense ?? "").trim();
                        if (v !== prev) void updateUser(u.id, { businessLicense: v || null });
                      }}
                      className="w-full max-w-[140px] rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                    />
                  ) : (
                    <span className="text-xs text-[var(--muted)]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {u.role === "CLIENT" ? (
                    <input
                      type="text"
                      defaultValue={u.tobaccoLicense ?? ""}
                      key={`tl-${u.id}-${u.tobaccoLicense ?? ""}`}
                      placeholder="Tobacco License"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const prev = (u.tobaccoLicense ?? "").trim();
                        if (v !== prev) void updateUser(u.id, { tobaccoLicense: v || null });
                      }}
                      className="w-full max-w-[140px] rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                    />
                  ) : (
                    <span className="text-xs text-[var(--muted)]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-[var(--muted)]">{u._count.orders}</td>
                <td className="px-4 py-3 align-top text-xs text-[var(--muted)]">
                  {new Date(u.createdAt).toLocaleDateString(APP_LOCALE, { dateStyle: "medium" })}
                </td>
                <td className="px-4 py-3 align-top">
                  {u.role === "CLIENT" ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void enterAsClient(u.id);
                      }}
                      className="whitespace-nowrap rounded-md border border-[var(--accent)]/50 bg-[var(--accent)]/15 px-2.5 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/25"
                    >
                      Ver tienda como este usuario
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUserId ? (
        <AdminUserHandoffPanel
          key={selectedUserId}
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      ) : null}
    </div>
  );
}
