"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  navBrowse: string;
  navCart: string;
  navOrders: string;
};

function itemClass(active: boolean) {
  const base =
    "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] font-bold leading-tight touch-manipulation transition-colors active:bg-neutral-100";
  if (active) return `${base} text-[#0071dc]`;
  return `${base} text-neutral-600 hover:text-neutral-900`;
}

function IconShop({ className }: { className?: string }) {
  return (
    <svg className={className} width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10V20H20V10M4 10L2 4H22L20 10M4 10H20M9 14H15"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCart({ className }: { className?: string }) {
  return (
    <svg className={className} width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="20" r="1.5" fill="currentColor" />
      <circle cx="17" cy="20" r="1.5" fill="currentColor" />
      <path
        d="M3 4h2l1.2 8.4a2 2 0 0 0 2 1.6h9.6a2 2 0 0 0 2-1.6L21 7H7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconOrders({ className }: { className?: string }) {
  return (
    <svg className={className} width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6H21M8 12H21M8 18H21M4 6H4.01M4 12H4.01M4 18H4.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TiendaMobileNav({ navBrowse, navCart, navOrders }: Props) {
  const path = usePathname() ?? "";
  const onCart = path.startsWith("/tienda/carrito");
  const onOrders = path.startsWith("/tienda/pedidos");
  const onBrowse = !onCart && !onOrders;

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md md:hidden"
      aria-label="Navegación principal"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1 px-1 pt-1">
        <Link href="/tienda" className={itemClass(onBrowse)} prefetch={false}>
          <IconShop />
          {navBrowse}
        </Link>
        <Link href="/tienda/carrito" className={itemClass(onCart)} prefetch={false}>
          <IconCart />
          {navCart}
        </Link>
        <Link href="/tienda/pedidos" className={itemClass(onOrders)} prefetch={false}>
          <IconOrders />
          {navOrders}
        </Link>
      </div>
    </nav>
  );
}
