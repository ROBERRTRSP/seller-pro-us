import Link from "next/link";
import { getSession } from "@/lib/auth";

/** Sesión + cookies en layout: debe ser dinámico. */
export const dynamic = "force-dynamic";
import { TiendaImpersonationBar } from "@/components/TiendaImpersonationBar";
import { LogoutButton } from "@/components/LogoutButton";
import { SellerProLogo } from "@/components/SellerProLogo";
import { SiteSettingsProvider } from "@/components/SiteSettingsProvider";
import { TiendaMobileNav } from "@/components/TiendaMobileNav";
import { getSiteSettingsPublic } from "@/lib/site-settings";

export default async function TiendaLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const site = await getSiteSettingsPublic();

  return (
    <SiteSettingsProvider value={site}>
      <div className="min-h-screen bg-[#f2f2f2] text-neutral-900">
        {session?.impersonator ? (
          <TiendaImpersonationBar clientName={session.name} adminName={session.impersonator.name} />
        ) : null}
        <header className="no-print sticky top-0 z-20 border-b border-neutral-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 md:gap-4 md:px-4 md:py-3">
            <Link href="/tienda" className="min-w-0 shrink hover:opacity-90" prefetch={false}>
              <span className="hidden md:inline">
                <SellerProLogo brandName={site.storeName} size="md" />
              </span>
              <span className="md:hidden">
                <SellerProLogo brandName={site.storeName} size="sm" />
              </span>
            </Link>
            <nav className="hidden items-center gap-5 text-sm font-semibold text-neutral-700 md:flex">
              <Link href="/tienda" className="hover:text-[#0071dc]" prefetch={false}>
                {site.navBrowse}
              </Link>
              <Link href="/tienda/carrito" className="hover:text-[#0071dc]" prefetch={false}>
                {site.navCart}
              </Link>
              <Link href="/tienda/pedidos" className="hover:text-[#0071dc]" prefetch={false}>
                {site.navOrders}
              </Link>
            </nav>
            <div className="flex shrink-0 items-center gap-2 md:gap-3">
              <span className="hidden max-w-[160px] truncate text-sm text-neutral-600 md:inline">
                {session?.name}
              </span>
              <LogoutButton className="touch-manipulation max-md:px-2.5 max-md:py-2 max-md:text-xs" />
            </div>
          </div>
        </header>
        <div className="no-print border-b border-amber-200/60 bg-amber-50 px-3 py-2 text-center text-xs text-amber-950 sm:px-4 sm:text-sm">
          {site.storefrontNotice}
        </div>
        <main className="mx-auto w-full max-w-7xl px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-4 md:px-4 md:pb-8 md:pt-8">
          {children}
        </main>
        <TiendaMobileNav
          navBrowse={site.navBrowse}
          navCart={site.navCart}
          navOrders={site.navOrders}
        />
      </div>
    </SiteSettingsProvider>
  );
}
