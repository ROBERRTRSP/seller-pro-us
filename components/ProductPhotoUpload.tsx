"use client";

import { useId, useState } from "react";

type Props = {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  /** File input id for label association (accessibility) */
  inputId?: string;
};

export function ProductPhotoUpload({ value, onChange, disabled, inputId }: Props) {
  const autoId = useId();
  const id = inputId ?? `photo-${autoId}`;
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setLocalError("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setLocalError("Debes iniciar sesión como administrador para subir fotos.");
          return;
        }
        setLocalError(typeof data.error === "string" ? data.error : "Error al subir");
        return;
      }
      if (typeof data.url === "string" && data.url.length > 0) {
        onChange(data.url);
      } else {
        setLocalError("El servidor no devolvió una URL de imagen. Inténtalo de nuevo o pega un enlace.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          id={id}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={disabled || busy}
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <label
          htmlFor={id}
          className={`inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-center text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-[var(--surface)] ${
            disabled || busy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {busy ? "Subiendo…" : "📷 Hacer o elegir foto"}
        </label>
        <span className="self-center text-xs text-[var(--muted)] sm:max-w-[220px]">
          En el móvil puedes usar la cámara o la galería. Máx. 8 MB (JPG, PNG, WebP, GIF). Se guarda el archivo completo:
          usa Wi‑Fi si la foto es grande.
        </span>
      </div>
      {localError ? <p className="text-sm text-red-400">{localError}</p> : null}
      {value ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Vista previa" className="h-24 w-24 rounded-lg border border-[var(--border)] object-cover" />
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onChange("")}
            className="text-sm text-red-400 hover:underline disabled:opacity-50"
          >
            Quitar imagen
          </button>
        </div>
      ) : null}
    </div>
  );
}
