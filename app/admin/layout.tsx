import Link from "next/link";
import { ExitImpersonationButton } from "@/components/ExitImpersonationButton";
import { LogoutButton } from "@/components/LogoutButton";
import { SellerProMark } from "@/components/SellerProLogo";
import { getImpersonationContext, getSessionFromCookie } from "@/lib/auth";
import { getSiteSettingsPublic } from "@/lib/site-settings";
import { mergeSiteSettingsRow } from "@/lib/site-settings-defaults";

/** Lee cookies/sesión: no puede prerender estático en build (Vercel). */
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Inicio" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/informes", label: "Informes" },
  { href: "/admin/site", label: "Sitio" },
] as const;

const navLinkMobile =
  "shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)] touch-manipulation";

const navLinkSide =
  "block rounded-xl px-3 py-3 text-base font-medium text-[var(--muted)] transition hover:bg-white/5 hover:text-[var(--text)] touch-manipulation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let session: Awaited<ReturnType<typeof getSessionFromCookie>> = null;
  let impCtx: Awaited<ReturnType<typeof getImpersonationContext>> = null;
  let site = mergeSiteSettingsRow(null);

  try {
    session = await getSessionFromCookie();
  } catch (e) {
    console.error("[admin/layout] session", e);
  }
  try {
    impCtx = await getImpersonationContext();
  } catch (e) {
    console.error("[admin/layout] impersonation", e);
  }
  try {
    site = await getSiteSettingsPublic();
  } catch (e) {
    console.error("[admin/layout] site settings", e);
    site = mergeSiteSettingsRow(null);
  }

  const mobileNav = (
    <nav className="flex gap-2 overflow-x-auto px-3 pb-3 [scrollbar-width:thin]">
      {NAV.map((item) => (
        <Link key={item.href} href={item.href} className={navLinkMobile} prefetch={false}>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const sideNav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
      {NAV.map((item) => (
        <Link key={item.href} href={item.href} className={navLinkSide} prefetch={false}>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] md:flex md:min-h-screen">
      <aside className="no-print hidden w-[220px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex lg:w-[260px]">
        <div className="border-b border-[var(--border)] p-4">
          <Link
            href="/admin"
            className="flex min-w-0 items-center gap-3 text-[var(--text)] hover:opacity-90"
            prefetch={false}
          >
            <SellerProMark size={40} className="shrink-0" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-400/90">
                Admin
              </span>
              <span className="truncate text-sm font-medium text-[var(--muted)]">{site.storeName}</span>
            </span>
          </Link>
        </div>
        {sideNav}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="no-print border-b border-[var(--border)] bg-[var(--surface)] md:hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-3">
            <Link
              href="/admin"
              className="flex min-w-0 items-center gap-2 text-[var(--text)] hover:opacity-90"
              prefetch={false}
            >
              <SellerProMark size={36} className="shrink-0" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-400/90">
                  Admin
                </span>
                <span className="truncate text-xs font-medium text-[var(--muted)]">{site.storeName}</span>
              </span>
            </Link>
            <LogoutButton className="touch-manipulation shrink-0" />
          </div>
          {mobileNav}
        </header>

        <header className="no-print hidden border-b border-[var(--border)] bg-[var(--surface)] md:flex md:items-center md:justify-between md:gap-4 md:px-6 md:py-3.5">
          <p className="text-sm font-medium text-[var(--muted)]">Panel de administración</p>
          <div className="flex items-center gap-4">
            <span className="max-w-[200px] truncate text-sm text-[var(--muted)] lg:max-w-xs">
              {session?.name}
            </span>
            <LogoutButton className="touch-manipulation" />
          </div>
        </header>

        {impCtx ? (
          <div
            className="no-print border-b border-amber-500/35 bg-amber-950/35 px-4 py-2.5 text-center text-sm text-amber-100 md:px-6 md:text-left"
            role="status"
          >
            Estás viendo la tienda como <strong>{impCtx.clientName}</strong>{" "}
            <span className="text-amber-200/80">({impCtx.clientEmail})</span>
            <span className="mx-2 text-amber-200/50 max-md:hidden">·</span>
            <span className="mt-2 block md:mt-0 md:inline">
              <Link href="/tienda" className="text-amber-300 underline hover:text-amber-200">
                Abrir tienda
              </Link>
              <span className="ml-3 inline-block align-middle">
                <ExitImpersonationButton />
              </span>
            </span>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-4 py-6 md:max-w-none md:px-8 md:py-8 lg:px-10">
          <div className="mx-auto max-w-[1100px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
