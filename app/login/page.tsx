"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SellerProLogo } from "@/components/SellerProLogo";
import { safeInternalPath } from "@/lib/safe-internal-path";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("magic");
    if (!q) return;
    const messages: Record<string, string> = {
      expired: "Ese enlace de acceso caducó. Pide un código QR nuevo en la tienda o inicia sesión abajo.",
      invalid: "Ese enlace de acceso no es válido. Pide un código QR nuevo o inicia sesión abajo.",
      denied: "Ese enlace no se puede usar con esta cuenta.",
      missing: "No se proporcionó ningún enlace de acceso.",
      error: "No se pudo completar el acceso desde el enlace. Inténtalo de nuevo o usa correo y contraseña.",
    };
    setError(messages[q] ?? "");
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          const ra = res.headers.get("Retry-After");
          const wait = ra ? ` Espera ${ra} segundos e inténtalo de nuevo.` : "";
          setError((typeof data.error === "string" ? data.error : "Demasiados intentos.") + wait);
          return;
        }
        setError(data.error ?? "No se pudo iniciar sesión");
        return;
      }
      router.push(safeInternalPath(data.redirect, "/"));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-xl">
        <div className="mb-6 flex justify-center">
          <SellerProLogo size="lg" className="justify-center" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Cuenta de cliente o de administración.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--muted)]">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--muted)]">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--accent)] py-2.5 font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="mt-6 text-xs text-[var(--muted)]">
          Demo: <span className="text-[var(--text)]">cliente@tienda.local</span> o{" "}
          <span className="text-[var(--text)]">admin@tienda.local</span> — contraseña{" "}
          <span className="text-[var(--text)]">demo1234</span>
        </p>
      </div>
    </div>
  );
}
