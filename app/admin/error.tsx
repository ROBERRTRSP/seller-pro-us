"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-6">
      <h2 className="text-lg font-semibold text-red-100">Algo salió mal en el panel</h2>
      <p className="mt-2 text-sm text-red-100/85">
        {error.message || "Error inesperado al cargar esta sección."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-lg bg-red-900/80 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
      >
        Reintentar
      </button>
    </div>
  );
}
