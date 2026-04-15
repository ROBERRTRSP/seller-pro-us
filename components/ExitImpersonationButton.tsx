"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  /** After exit, navigate here (defaults to admin). */
  redirectTo?: string;
  className?: string;
};

export function ExitImpersonationButton({ redirectTo = "/admin", className }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function stop() {
    setBusy(true);
    try {
      await fetch("/api/admin/impersonate", { method: "DELETE" });
      router.push(redirectTo);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void stop()}
      className={
        className ??
        "rounded-md border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
      }
    >
      {busy ? "…" : "Salir de vista cliente"}
    </button>
  );
}
