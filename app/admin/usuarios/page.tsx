"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminUserHandoffPanel } from "@/components/AdminUserHandoffPanel";
import type { AdminUserListRow } from "@/lib/admin-user-types";
import { ADMIN_FETCH_NETWORK, ADMIN_FETCH_TIMEOUT, adminFetchJson } from "@/lib/admin-client-fetch";
import { APP_LOCALE } from "@/lib/us-locale";
import { safeInternalPath } from "@/lib/safe-internal-path";

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

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0];
    const b = parts[parts.length - 1]?.[0];
    if (a && b) return (a + b).toUpperCase();
  }
  const one = parts[0] ?? "?";
  return one.slice(0, 2).toUpperCase();
}

export default function AdminUsuariosPage() {
  const [list, setList] = useState<AdminUserListRow[]>([]);
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [clientsOnly, setClientsOnly] = useState(false);

  async function load() {
    const res = await adminFetchJson<AdminUserListRow[]>("/api/admin/users");
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

  async function deleteClientAccount(u: AdminUserListRow) {
    if (u.role !== "CLIENT") return;
    const n = u._count.orders;
    const msg =
      n > 0
        ? `¿Eliminar la cuenta de «${u.name}» (${u.email})?\n\nSe borrarán también ${n} pedido(s) vinculados. Esta acción no se puede deshacer.`
        : `¿Eliminar la cuenta de «${u.name}» (${u.email})?\n\nEsta acción no se puede deshacer.`;
    if (!confirm(msg)) return;
    setError("");
    setDeletingId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "No se pudo eliminar la cuenta");
        return;
      }
      if (selectedUserId === u.id) setSelectedUserId(null);
      await load();
    } finally {
      setDeletingId(null);
    }
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

  const selectedUser = selectedUserId ? list.find((u) => u.id === selectedUserId) : undefined;

  const filteredList = useMemo(() => {
    const q = normalizeSearchText(userSearch);
    const rows = clientsOnly ? list.filter((u) => u.role === "CLIENT") : list;
    if (!q) return rows;
    return rows.filter((u) => {
      const haystack = normalizeSearchText(`${u.name} ${u.email}`);
      return haystack.includes(q);
    });
  }, [list, userSearch, clientsOnly]);

  const clientCount = useMemo(() => list.filter((u) => u.role === "CLIENT").length, [list]);

  if (loading) {
    return <p className="text-[var(--muted)]">Cargando…</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Usuarios</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
        Crea cuentas nuevas aquí abajo. En cada <strong>cliente</strong>, bajo nombre y correo tienes{" "}
        <strong>Editar cuenta</strong> (panel con datos, QR, pedidos, eliminar) y <strong>Ver tienda</strong> (entrar a
        la tienda como ese usuario). Los <strong>administradores</strong> solo tienen el botón Editar al final de la
        fila.
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Alta de <strong>Cliente</strong>: teléfono, dirección y ambas licencias obligatorios.
      </p>
      {error ? <p className="mt-4 rounded-lg border border-red-500/35 bg-red-950/25 px-4 py-3 text-sm text-red-200">{error}</p> : null}

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
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {creating ? "Creando…" : "Crear usuario"}
        </button>
      </form>

      <div className="mt-10 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
        <div className="border-b border-[var(--border)] bg-[var(--bg)]/50 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--text)]">Usuarios registrados</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {list.length} en total
            {clientCount > 0 ? ` · ${clientCount} cliente${clientCount === 1 ? "" : "s"}` : null}
          </p>
        </div>
        <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg)]/35 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="admin-usuarios-buscar" className="sr-only">
              Buscar usuarios por nombre o correo
            </label>
            <span
              className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--muted)]"
              aria-hidden
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              id="admin-usuarios-buscar"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Buscar por nombre o correo…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2.5 pl-10 pr-10 text-sm text-[var(--text)] outline-none ring-[var(--accent)]/20 placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2"
            />
            {userSearch.trim() ? (
              <button
                type="button"
                onClick={() => setUserSearch("")}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                Limpiar
              </button>
            ) : null}
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border)]/80 bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)] hover:border-[var(--accent)]/40">
            <input
              type="checkbox"
              checked={clientsOnly}
              onChange={(e) => setClientsOnly(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border)] bg-[var(--bg)] text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <span>Solo clientes</span>
          </label>
        </div>
        <p className="border-b border-[var(--border)]/80 px-4 py-2 text-xs text-[var(--muted)] sm:px-5">
          {filteredList.length === list.length && !clientsOnly && !userSearch.trim() ? (
            <span>Mostrando todos los usuarios.</span>
          ) : (
            <span>
              Mostrando <strong className="text-[var(--text)]">{filteredList.length}</strong>
              {filteredList.length !== list.length ? (
                <>
                  {" "}
                  de {list.length}
                </>
              ) : null}
              {clientsOnly ? " (solo clientes)" : null}
              {userSearch.trim() ? " · filtro de búsqueda activo" : null}
            </span>
          )}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                <th className="min-w-[260px] px-4 py-3 pl-5 sm:px-5">Perfil</th>
                <th className="px-3 py-3">Rol</th>
                <th className="px-3 py-3">Pedidos</th>
                <th className="px-3 py-3">Alta</th>
                <th className="px-4 py-3 pr-5 text-right sm:px-5">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/70">
              {filteredList.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-[var(--accent)]/[0.04]">
                  <td className="max-w-[min(90vw,380px)] px-4 py-4 pl-5 align-top sm:px-5">
                    <div className="flex gap-3">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)]/35 via-[var(--accent)]/15 to-transparent text-sm font-bold tracking-tight text-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]/25"
                        aria-hidden
                      >
                        {userInitials(u.name)}
                      </div>
                      <div className="min-w-0 flex-1 rounded-xl border border-[var(--border)]/90 bg-[var(--bg)]/60 px-3 py-2.5 shadow-sm">
                        <p className="font-semibold leading-snug text-[var(--text)]">{u.name}</p>
                        <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-[var(--muted)]">
                          {u.email}
                        </p>
                        {u.role === "CLIENT" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedUserId(u.id)}
                              className={`touch-manipulation rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition ${
                                selectedUserId === u.id
                                  ? "bg-[var(--accent)] text-white ring-2 ring-[var(--accent)]/40"
                                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/10"
                              }`}
                            >
                              Editar cuenta
                            </button>
                            <button
                              type="button"
                              onClick={() => void enterAsClient(u.id)}
                              className="touch-manipulation rounded-lg border border-emerald-500/35 bg-emerald-950/35 px-3 py-2 text-xs font-semibold text-emerald-200/95 shadow-sm hover:bg-emerald-950/55"
                            >
                              Ver tienda
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    {u.role === "CLIENT" ? (
                      <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-950/40 px-2.5 py-1 text-xs font-medium text-sky-100/95">
                        Cliente
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-amber-500/35 bg-amber-950/35 px-2.5 py-1 text-xs font-medium text-amber-100/95">
                        Admin
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <span className="inline-flex min-w-[2rem] items-center justify-center rounded-lg bg-[var(--bg)] px-2 py-1 text-center text-sm font-semibold tabular-nums text-[var(--text)] ring-1 ring-[var(--border)]/80">
                      {u._count.orders}
                    </span>
                  </td>
                  <td className="px-3 py-4 align-middle text-xs text-[var(--muted)]">
                    <time dateTime={u.createdAt}>
                      {new Date(u.createdAt).toLocaleDateString(APP_LOCALE, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </td>
                  <td className="px-4 py-4 pr-5 text-right align-middle sm:px-5">
                    {u.role === "ADMIN" ? (
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(u.id)}
                        className={`touch-manipulation rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition ${
                          selectedUserId === u.id
                            ? "bg-[var(--accent)] text-white ring-2 ring-[var(--accent)]/40"
                            : "border border-[var(--border)] bg-[var(--bg)] text-[var(--accent)] hover:border-[var(--accent)]/60"
                        }`}
                      >
                        Editar
                      </button>
                    ) : (
                      <span
                        className="inline-block rounded-lg bg-[var(--bg)]/50 px-2 py-1 text-[11px] text-[var(--muted)]/70 ring-1 ring-[var(--border)]/40"
                        title="Usa los botones del perfil"
                      >
                        En perfil
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-[var(--muted)]">
                    {list.length === 0
                      ? "No hay usuarios."
                      : "Ningún usuario coincide con el filtro. Prueba otras palabras o quita «Solo clientes»."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUser ? (
        <AdminUserHandoffPanel
          key={selectedUser.id}
          user={selectedUser}
          onClose={() => setSelectedUserId(null)}
          onReload={load}
          updateUser={updateUser}
          enterAsClient={enterAsClient}
          deleteClientAccount={deleteClientAccount}
          pwdDraft={pwdDraft}
          setPwdDraft={setPwdDraft}
          pwdSaving={pwdSaving}
          savePassword={savePassword}
          deletingId={deletingId}
        />
      ) : null}
    </div>
  );
}
