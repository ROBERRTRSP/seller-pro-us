"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/money";
import { sortCategorySectionKeys } from "@/lib/catalog-sections";
import { MAX_ORDER_LINE_QUANTITY } from "@/lib/order-quantity-limits";
import { useSiteSettings } from "@/components/SiteSettingsProvider";
import { isOutOfStock, stockPurchaseCap, isUnlimitedStock } from "@/lib/product-stock";

type Product = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  promoBadge: string | null;
  category: string | null;
  categorySortOrder?: number;
  stock: number;
  sku: string | null;
  barcode: string | null;
  imagePending: boolean;
  imageUrl: string | null;
  brand?: string | null;
  size?: string | null;
  packSize?: string | null;
  ageRestricted?: boolean;
  minimumAge?: number | null;
};

const CART_KEY = "tienda_cart";

type CartLine = { productId: string; quantity: number };

function readCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(lines: CartLine[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(lines));
}

function badgeClass(badge: string | null): string {
  const b = (badge ?? "").toLowerCase();
  if (b.includes("rollback")) return "bg-[#e31837] text-white";
  if (b.includes("clearance") || b.includes("liquidación") || b.includes("liquidacion"))
    return "bg-[#ff6600] text-white";
  if (
    b.includes("reduced") ||
    b.includes("precio") ||
    b.includes("reducido") ||
    b.includes("price")
  )
    return "bg-[#c41e7a] text-white";
  return "bg-neutral-700 text-white";
}

const CATALOG_FETCH_MS = 25_000;

export default function TiendaPage() {
  const site = useSiteSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const fetchSeq = useRef(0);

  function syncCartFromStorage() {
    setCartLines(readCart());
  }

  const loadProducts = useCallback(async (showSpinner: boolean) => {
    const seq = ++fetchSeq.current;
    if (showSpinner) setLoading(true);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), CATALOG_FETCH_MS);
    try {
      const r = await fetch("/api/products", { cache: "no-store", signal: ac.signal });
      clearTimeout(t);
      if (seq !== fetchSeq.current) return;

      const d = (await r.json().catch(() => null)) as unknown;
      if (!r.ok) {
        setProducts([]);
        setMsg(
          r.status === 401
            ? "Sesión caducada. Vuelve a iniciar sesión."
            : "No se pudo cargar el catálogo. Prueba a recargar la página.",
        );
        return;
      }
      if (Array.isArray(d)) {
        setProducts(d as Product[]);
      } else {
        setProducts([]);
        setMsg("Respuesta inesperada del servidor.");
      }
    } catch (e: unknown) {
      if (seq !== fetchSeq.current) return;
      setProducts([]);
      const aborted = e instanceof Error && e.name === "AbortError";
      setMsg(
        aborted
          ? "El catálogo tarda demasiado. Comprueba el servidor o la conexión y recarga."
          : "Error de red al cargar el catálogo.",
      );
    } finally {
      clearTimeout(t);
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts(true);
  }, [loadProducts]);

  useEffect(() => {
    syncCartFromStorage();
  }, [products]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_KEY || e.key === null) syncCartFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** No registrar focus/visibility hasta terminar la primera carga: evita dos fetch paralelos al abrir /tienda. */
  useEffect(() => {
    if (loading) return;

    const onFocus = () => {
      void loadProducts(false);
      syncCartFromStorage();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadProducts(false);
        syncCartFromStorage();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loading, loadProducts]);

  const visibleProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const haystack =
        `${p.name} ${p.description} ${p.category ?? ""} ${p.sku ?? ""} ${p.barcode ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [products, searchQuery]);

  const byCategory = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of visibleProducts) {
      const key = (p.category ?? "").trim() || "Other";
      const list = m.get(key) ?? [];
      list.push(p);
      m.set(key, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return m;
  }, [visibleProducts]);

  const sectionKeys = useMemo(() => {
    const hint = new Map<string, number>();
    for (const p of visibleProducts) {
      const k = (p.category ?? "").trim() || "Other";
      const o = p.categorySortOrder ?? 999999;
      hint.set(k, Math.min(hint.get(k) ?? o, o));
    }
    return sortCategorySectionKeys([...byCategory.keys()], hint);
  }, [byCategory, visibleProducts]);

  function qtyInCart(productId: string) {
    return cartLines.find((l) => l.productId === productId)?.quantity ?? 0;
  }

  function addToCart(p: Product, e?: MouseEvent) {
    e?.stopPropagation();
    if (isOutOfStock(p.stock)) return;
    const cart = readCart();
    const i = cart.findIndex((l) => l.productId === p.id);
    const currentQty = i >= 0 ? cart[i].quantity : 0;
    const maxAllowed = stockPurchaseCap(p.stock, MAX_ORDER_LINE_QUANTITY);
    if (currentQty + 1 > maxAllowed) {
      setMsg(`No hay más existencias de «${p.name}».`);
      return;
    }
    if (i >= 0) cart[i] = { ...cart[i], quantity: cart[i].quantity + 1 };
    else cart.push({ productId: p.id, quantity: 1 });
    writeCart(cart);
    setCartLines(cart);
    setMsg(`«${p.name}» se agregó al carrito.`);
  }

  const flashProducts = useMemo(() => {
    return visibleProducts
      .filter((p) => {
        const deal =
          p.compareAtPriceCents != null && p.compareAtPriceCents > p.priceCents;
        const b = (p.promoBadge ?? "").toLowerCase();
        const tag =
          /clearance|liquidación|liquidacion|rollback|reduced|rebaj|flash|ofert|precio/i.test(
            b,
          );
        return deal || tag;
      })
      .slice(0, 12);
  }, [visibleProducts]);

  if (loading) {
    return (
      <div className="space-y-6 text-neutral-900" aria-busy="true" aria-live="polite">
        <div className="animate-pulse rounded-2xl bg-[#0071dc]/40 px-4 py-10 sm:py-12">
          <div className="mx-auto max-w-4xl space-y-3">
            <div className="h-3 w-32 rounded bg-white/30" />
            <div className="h-9 w-full max-w-md rounded bg-white/25" />
            <div className="h-5 w-full max-w-sm rounded bg-white/20" />
            <div className="h-16 max-w-2xl rounded bg-white/15" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-lg bg-neutral-200/90"
              aria-hidden
            />
          ))}
        </div>
        <p className="text-center text-sm font-medium text-neutral-600">Cargando catálogo…</p>
      </div>
    );
  }

  return (
    <div className="text-neutral-900">
      <section
        id="inicio-catalogo"
        className="relative -mx-3 overflow-hidden bg-[#0071dc] px-4 py-7 text-white shadow-md sm:-mx-0 sm:rounded-b-2xl sm:px-8 sm:py-10"
      >
        <div className="relative z-[1] mx-auto max-w-4xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-100">
            {site.heroEyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-[2.5rem]">
            {site.heroTitle}
          </h1>
          <p className="mt-2 text-lg font-semibold text-blue-50 sm:text-xl">{site.heroSubtitle}</p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-blue-100/95">{site.heroBody}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href="#todo-catalogo"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-2.5 text-sm font-bold text-[#0071dc] shadow touch-manipulation hover:bg-blue-50 sm:min-h-0"
            >
              {site.heroCtaLabel}
            </a>
            <Link
              href="/tienda/carrito"
              className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-white/90 bg-transparent px-6 py-2.5 text-sm font-bold text-white touch-manipulation hover:bg-white/10 sm:min-h-0"
            >
              {site.navCart}
            </Link>
          </div>
        </div>
        <div
          className="pointer-events-none absolute -right-16 top-0 h-56 w-56 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
      </section>

      {msg ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-900 shadow-sm">
          {msg}
        </p>
      ) : null}

      {products.length > 0 ? (
        <nav
          className="no-print sticky top-24 z-10 -mx-3 mt-4 border-y border-neutral-200 bg-white/95 py-2 shadow-sm backdrop-blur-sm sm:-mx-0 sm:top-28 sm:mt-6 sm:rounded-lg sm:border"
          aria-label="Buscador de productos"
        >
          <div className="px-2 pb-1 pt-1 sm:px-3">
            <label htmlFor="search-products" className="sr-only">
              Buscar productos
            </label>
            <input
              id="search-products"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar productos..."
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none ring-[#0071dc]/20 placeholder:text-neutral-400 focus:border-[#0071dc] focus:ring-2"
            />
          </div>
        </nav>
      ) : null}

      {flashProducts.length > 0 ? (
        <section className="mt-8 scroll-mt-32" id="flash-ofertas">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-neutral-200 pb-2">
            <div>
              <h2 className="text-xl font-black tracking-tight text-neutral-900">Flash Ofertas</h2>
              <p className="text-xs font-semibold text-[#0071dc]">
                Hasta 65% de descuento en selección
              </p>
            </div>
            <a href="#todo-catalogo" className="text-sm font-bold text-[#0071dc] hover:underline">
              Ver todo
            </a>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6">
            {flashProducts.map((p) => (
              <ProductTile
                key={`flash-${p.id}`}
                p={p}
                qty={qtyInCart(p.id)}
                canAdd={qtyInCart(p.id) < stockPurchaseCap(p.stock, MAX_ORDER_LINE_QUANTITY)}
                onAdd={addToCart}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div id="todo-catalogo" className="mt-10 scroll-mt-24 space-y-8 sm:scroll-mt-28 sm:space-y-10">
        {sectionKeys.map((section, si) => {
          const list = byCategory.get(section) ?? [];
          return (
            <section key={section} id={`seccion-${si}`} className="scroll-mt-36">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-neutral-200 pb-2">
                <h2 className="text-lg font-black text-neutral-900 sm:text-xl">{section}</h2>
                <a
                  href="#todo-catalogo"
                  className="text-sm font-bold text-[#0071dc] hover:underline"
                >
                  Ver todo
                </a>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {list.map((p) => (
                  <ProductTile
                    key={p.id}
                    p={p}
                    qty={qtyInCart(p.id)}
                    canAdd={qtyInCart(p.id) < stockPurchaseCap(p.stock, MAX_ORDER_LINE_QUANTITY)}
                    onAdd={addToCart}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {products.length > 0 && visibleProducts.length === 0 ? (
        <p className="mt-10 rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600 shadow-sm">
          No se encontraron productos con esa búsqueda.
        </p>
      ) : null}

      {products.length === 0 ? (
        <p className="mt-10 rounded-xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600 shadow-sm">
          Aún no hay artículos en el catálogo. Crea productos en administración; pueden mostrarse con
          «foto pendiente» hasta que subas una imagen verificada.
        </p>
      ) : null}
    </div>
  );
}

const BROKEN_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#e5e7eb" width="200" height="200"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-family="system-ui" font-size="12">Foto</text></svg>`,
  );

const PENDING_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#fef3c7" width="200" height="200"/><text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle" fill="#92400e" font-family="system-ui" font-size="11" font-weight="600">Foto pendiente</text><text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" fill="#b45309" font-family="system-ui" font-size="9">Marca / tipo / presentación</text></svg>`,
  );

function ProductTile({
  p,
  qty,
  canAdd,
  onAdd,
}: {
  p: Product;
  qty: number;
  canAdd: boolean;
  onAdd: (product: Product, e?: MouseEvent) => void;
}) {
  const [imgSrc, setImgSrc] = useState(p.imagePending ? "" : (p.imageUrl ?? ""));
  useEffect(() => {
    if (p.imagePending) return;
    setImgSrc(p.imageUrl ?? "");
  }, [p.imagePending, p.imageUrl]);
  const hasCompare =
    p.compareAtPriceCents != null && p.compareAtPriceCents > p.priceCents;
  const showPending = p.imagePending;
  return (
    <article className="flex flex-col rounded-lg border border-neutral-200 bg-white p-2 shadow-sm transition-shadow hover:shadow-md sm:p-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-neutral-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={showPending ? PENDING_IMG : imgSrc || BROKEN_IMG}
          alt=""
          className="h-full w-full object-contain p-1"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onError={() => {
            if (!showPending) setImgSrc(BROKEN_IMG);
          }}
        />
        {p.promoBadge ? (
          <span
            className={`absolute left-1 top-1 max-w-[90%] truncate rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-tight shadow ${badgeClass(p.promoBadge)}`}
          >
            {p.promoBadge}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <span className="text-[11px] font-semibold text-[#0071dc]">Opciones</span>
        <h3
          className="mt-0.5 line-clamp-2 min-h-[2.25rem] text-left text-xs font-medium leading-snug text-neutral-900 sm:text-[13px]"
          title={p.name}
        >
          {p.name}
        </h3>
        <div className="mt-2 flex flex-1 flex-col justify-end gap-1">
          {hasCompare ? (
            <p className="text-[11px] text-neutral-500">
              Antes <span className="line-through">{formatCents(p.compareAtPriceCents!)}</span>
            </p>
          ) : null}
          <p className="text-base font-black text-neutral-900 sm:text-lg">
            {formatCents(p.priceCents)}
          </p>
          <p className="text-[10px] text-neutral-500">
            precio actual · {isUnlimitedStock(p.stock) ? "Stock ilimitado" : `Stock ${p.stock}`}
          </p>
          {qty > 0 ? (
            <p className="text-[11px] font-semibold text-emerald-700">En carrito: {qty}</p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={!canAdd}
          onClick={(e) => onAdd(p, e)}
          className="mt-2 flex min-h-11 w-full items-center justify-center rounded-full border border-[#0071dc] bg-[#0071dc] py-2.5 text-xs font-bold uppercase tracking-wide text-white touch-manipulation hover:bg-[#005bb5] disabled:border-neutral-200 disabled:bg-neutral-200 disabled:text-neutral-500 sm:min-h-0 sm:py-2"
        >
          {canAdd ? "Agregar" : "Agotado"}
        </button>
      </div>
    </article>
  );
}
