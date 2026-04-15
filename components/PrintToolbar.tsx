"use client";

export function PrintToolbar() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] print:hidden"
    >
      Imprimir o guardar como PDF
    </button>
  );
}
