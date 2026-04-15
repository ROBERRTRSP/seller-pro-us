"use client";

import { useRouter } from "next/navigation";

const baseBtnClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-600 shadow-sm transition hover:border-red-400 hover:text-red-700";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} className={`${baseBtnClass} ${className}`.trim()}>
      Cerrar sesión
    </button>
  );
}
