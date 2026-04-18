/** Defaults when the DB row is missing or a field is blank. */
export const DEFAULT_SITE_SETTINGS = {
  siteTitle: "Seller Pro US — Store & admin",
  siteDescription: "US pro storefront: catalog, cart, and orders. Cash on delivery — no online payment.",
  storeName: "Seller Pro US",
  storefrontNotice:
    "No online payment: pay on delivery, cash only. No credit. All catalog items are listed; items without a verified photo show as photo pending.",
  navBrowse: "Browse",
  navCart: "Cart",
  navOrders: "My orders",
  heroEyebrow: "",
  heroTitle: "",
  heroSubtitle: "",
  heroBody: "",
  heroCtaLabel: "",
} as const;

export type SiteSettingsPublic = { [K in keyof typeof DEFAULT_SITE_SETTINGS]: string };

/** Valores tal como se guardan en BD (vacío = en la tienda se usa el predeterminado). */
export const EMPTY_SITE_SETTINGS: SiteSettingsPublic = {
  siteTitle: "",
  siteDescription: "",
  storeName: "",
  storefrontNotice: "",
  navBrowse: "",
  navCart: "",
  navOrders: "",
  heroEyebrow: "",
  heroTitle: "",
  heroSubtitle: "",
  heroBody: "",
  heroCtaLabel: "",
};

export function rawRowToForm(
  row: {
    siteTitle: string;
    siteDescription: string;
    storeName: string;
    storefrontNotice: string;
    navBrowse: string;
    navCart: string;
    navOrders: string;
    heroEyebrow: string;
    heroTitle: string;
    heroSubtitle: string;
    heroBody: string;
    heroCtaLabel: string;
  } | null,
): SiteSettingsPublic {
  if (!row) return { ...EMPTY_SITE_SETTINGS };
  return {
    siteTitle: row.siteTitle,
    siteDescription: row.siteDescription,
    storeName: row.storeName,
    storefrontNotice: row.storefrontNotice,
    navBrowse: row.navBrowse,
    navCart: row.navCart,
    navOrders: row.navOrders,
    heroEyebrow: row.heroEyebrow,
    heroTitle: row.heroTitle,
    heroSubtitle: row.heroSubtitle,
    heroBody: row.heroBody,
    heroCtaLabel: row.heroCtaLabel,
  };
}

function pick(s: string | null | undefined, fallback: string): string {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : fallback;
}

export function mergeSiteSettingsRow(row: {
  siteTitle: string;
  siteDescription: string;
  storeName: string;
  storefrontNotice: string;
  navBrowse: string;
  navCart: string;
  navOrders: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  heroBody: string;
  heroCtaLabel: string;
} | null): SiteSettingsPublic {
  const d = DEFAULT_SITE_SETTINGS;
  if (!row) {
    return { ...d };
  }
  return {
    siteTitle: pick(row.siteTitle, d.siteTitle),
    siteDescription: pick(row.siteDescription, d.siteDescription),
    storeName: pick(row.storeName, d.storeName),
    storefrontNotice: pick(row.storefrontNotice, d.storefrontNotice),
    navBrowse: pick(row.navBrowse, d.navBrowse),
    navCart: pick(row.navCart, d.navCart),
    navOrders: pick(row.navOrders, d.navOrders),
    heroEyebrow: pick(row.heroEyebrow, d.heroEyebrow),
    heroTitle: pick(row.heroTitle, d.heroTitle),
    heroSubtitle: pick(row.heroSubtitle, d.heroSubtitle),
    heroBody: pick(row.heroBody, d.heroBody),
    heroCtaLabel: pick(row.heroCtaLabel, d.heroCtaLabel),
  };
}
