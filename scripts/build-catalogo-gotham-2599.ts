/**
 * Catálogo desde https://www.gothamcigars.com/cigars/ (PLG BigCommerce Stencil).
 * Solo filas con imagen real (/products/), URL y nombre; HEAD 200 a la imagen.
 * Excluye accesorios, wraps, deals Groupon, etc. Precio fijo configurable.
 *
 *   npx tsx scripts/build-catalogo-gotham-2599.ts
 *
 * Salida: catalogo_gotham_2599.json, catalogo_gotham_2599.csv en la raíz del repo.
 */
import { writeFileSync } from "fs";
import path from "path";

const DEFAULT_PRICE = 25.99;

const BASE = "https://www.gothamcigars.com";
const CIGARS = `${BASE}/cigars/`;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const SLEEP_MS = 400;

/** Categorías Gotham a no exportar (accesorios, wraps, promos). */
const EXCLUDED_CATEGORIES = new Set(
  [
    "Cigar Accessories",
    "Wraps",
    "Groupon Deals",
    "Accessories",
    "Humidors",
    "Lighters",
    "Cutters",
    "Ashtrays",
    "Cigar Cases",
    "Gift Sets",
    "Samplers",
  ].map((s) => s.toLowerCase()),
);

const EXCLUDED_SLUG_SUBSTR = [
  "wraps",
  "-wrap-",
  "wrap-",
  "-wrap/",
  "/wrap/",
  "hemp-wrap",
  "rolling-wrap",
  "cigar-wrap",
  "nicotine",
  "zyn",
  "snus",
  "pouch",
  "smoke-free",
  "smokefree",
  "accessory",
  "humidor",
  "lighter",
  "cutter",
  "ashtray",
  "gift-set",
  "free-gift",
  "combo-deal",
  "groupon",
];

type Meta = Record<string, string>;

type RawRow = {
  product_url: string;
  product_name: string;
  image: string;
  price_site: string;
  msrp_site: string;
  description: string;
  meta: Meta;
};

function shouldExcludeByContent(row: RawRow): boolean {
  const slug = new URL(row.product_url).pathname.toLowerCase();
  if (slug.includes("groupon")) return true;
  if (row.image.toLowerCase().includes("groupon")) return true;
  const d = row.description.toLowerCase();
  if (d.includes("no longer available")) return true;
  if (d.includes("this product is no longer")) return true;
  if (d.includes("product has been discontinued")) return true;
  const n = row.product_name.toLowerCase();
  if (/\bfree\s+gift\b/i.test(n) || /\bfreebie\b/i.test(n)) return true;
  return false;
}

type CatalogRow = {
  sku: string;
  product_name: string;
  price: number;
  price_original: string;
  image: string;
  product_url: string;
  category: string;
  subcategory: string;
  brand: string;
  description: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseMetaFromH4Class(className: string): Meta {
  const out: Meta = {};
  const bar = className.indexOf("|");
  const rest = bar >= 0 ? className.slice(bar + 1) : className;
  const cleaned = rest.replace(/">?\s*$/i, "").trim();
  for (const piece of cleaned.split(",")) {
    const p = piece.trim();
    const m = p.match(/^([^:]+):\s*(.+)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/">$/, "").replace(/^["']|["']$/g, "");
  }
  return out;
}

function extractProductBlocks(html: string): string[] {
  const blocks: string[] = [];
  const needle = '<li class="product">';
  let i = 0;
  while (true) {
    const start = html.indexOf(needle, i);
    if (start === -1) break;
    const end = html.indexOf("</li>", start + needle.length);
    if (end === -1) break;
    blocks.push(html.slice(start, end + "</li>".length));
    i = end + 1;
  }
  return blocks;
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function parseProductBlock(block: string): RawRow | null {
  const url =
    firstMatch(
      block,
      /<a href="(https:\/\/www\.gothamcigars\.com\/[^"]+)"[^>]*data-instantload/i,
    ) || firstMatch(block, /<a href="(https:\/\/www\.gothamcigars\.com\/[^"]+)"[^>]*data-event-type="product-click"/i);
  if (!url || !url.includes("gothamcigars.com")) return null;

  const path = new URL(url).pathname.toLowerCase();
  for (const sub of EXCLUDED_SLUG_SUBSTR) {
    if (path.includes(sub)) return null;
  }

  const imgMatch = block.match(
    /src="(https:\/\/cdn11\.bigcommerce\.com\/[^"]+\/products\/\d+\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
  );
  if (!imgMatch) return null;
  const image = imgMatch[1].replace(/&amp;/g, "&");
  if (!/\/products\/\d+\//i.test(image)) return null;

  const h4m = block.match(/<h4 class="([^"]*)"[^>]*>\s*<a[^>]*>([^<]*)<\/a>/i);
  if (!h4m) return null;
  const meta = parseMetaFromH4Class(h4m[1]);
  const product_name = normalizeSpaces(decodeEntities(h4m[2]));
  if (!product_name || product_name.length < 2) return null;

  const catRaw = (meta.Category ?? "").trim();
  if (catRaw) {
    const low = catRaw.toLowerCase();
    for (const ex of EXCLUDED_CATEGORIES) {
      if (low === ex || low.includes(ex)) return null;
    }
    if (low.includes("wrap")) return null;
    if (low.includes("accessory")) return null;
    if (low.includes("groupon")) return null;
  }

  const priceNow =
    firstMatch(block, /<span[^>]*data-product-price-without-tax[^>]*>([\s\S]*?)<\/span>/i)?.replace(
      /\s+/g,
      " ",
    ) ?? "";
  const msrp =
    firstMatch(block, /<span[^>]*data-product-rrp-price-without-tax[^>]*>([\s\S]*?)<\/span>/i)?.replace(
      /\s+/g,
      " ",
    ) ?? "";

  const summaryM = block.match(
    /<div class="card-text card-text--summary"[^>]*>([\s\S]*?)<\/div>/i,
  );
  let description = "";
  if (summaryM) {
    description = normalizeSpaces(decodeEntities(summaryM[1].replace(/<[^>]+>/g, " ")));
    if (description.length > 600) description = description.slice(0, 597) + "...";
  }

  const raw: RawRow = {
    product_url: url.replace(/\/$/, ""),
    product_name,
    image,
    price_site: normalizeSpaces(priceNow),
    msrp_site: normalizeSpaces(msrp),
    description,
    meta,
  };
  if (shouldExcludeByContent(raw)) return null;
  return raw;
}

function mapCategory(meta: Meta): { category: string; subcategory: string } {
  const little = (meta.Little ?? "").toLowerCase() === "yes";
  const filtered = (meta.Filtered ?? "").toLowerCase() === "yes";
  const shape = (meta.Shape ?? "").toLowerCase();
  const ptype = (meta["Product Type"] ?? "").toLowerCase();
  const cat = (meta.Category ?? "").trim();

  let subcategory = cat;
  if (subcategory === "Machine Made") subcategory = "Machine Made Cigars";
  if (!subcategory) subcategory = "Cigars";

  if (little) {
    return { category: "little cigar", subcategory: subcategory.includes("Little") ? subcategory : "Little Cigars" };
  }
  if (filtered || shape.includes("filtered")) {
    return { category: "filtered cigar", subcategory: subcategory || "Filtered Cigars" };
  }
  if (ptype.includes("cigarillo") || shape.includes("cigarillo")) {
    return { category: "cigarillo", subcategory };
  }
  return { category: "cigar", subcategory };
}

function brandFromMeta(meta: Meta): string {
  const b = (meta.Brand ?? "").trim();
  if (b) return b;
  return (meta.Manufacturer ?? "").trim() || "Unknown";
}

function priceOriginalField(msrp: string, now: string): string {
  const parts: string[] = [];
  if (msrp) parts.push(msrp);
  if (now) parts.push(now.startsWith("$") ? `Now ${now}` : `Now $${now}`);
  return parts.length ? parts.join(" · ") : "";
}

async function headOkImage(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!r.ok) return false;
    const ct = r.headers.get("content-type") ?? "";
    return ct.startsWith("image/");
  } catch {
    return false;
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const j = i++;
      if (j >= items.length) break;
      out[j] = await fn(items[j]!);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const seenUrl = new Set<string>();
  const raw: RawRow[] = [];

  for (let page = 1; page <= 80; page++) {
    const url = page === 1 ? CIGARS : `${BASE}/cigars/?page=${page}`;
    const html = await fetchHtml(url);
    const blocks = extractProductBlocks(html);
    if (blocks.length === 0) {
      console.log(`Page ${page}: 0 products, stop.`);
      break;
    }
    let newOnes = 0;
    for (const b of blocks) {
      const row = parseProductBlock(b);
      if (!row) continue;
      if (seenUrl.has(row.product_url)) continue;
      seenUrl.add(row.product_url);
      raw.push(row);
      newOnes++;
    }
    console.log(`Page ${page}: +${newOnes} (total unique ${raw.length})`);
    await sleep(SLEEP_MS);
  }

  console.log(`Validating ${raw.length} images (HEAD)...`);
  const oks = await mapPool(raw, 16, async (r) => headOkImage(r.image));
  const passed = raw.filter((_, i) => oks[i]!);
  console.log(`Images OK: ${passed.length} / ${raw.length}`);

  const byName = new Map<string, CatalogRow>();
  let seq = 0;
  for (const r of passed) {
    const { category, subcategory } = mapCategory(r.meta);
    const brand = brandFromMeta(r.meta);
    const price_original = priceOriginalField(r.msrp_site, r.price_site);
    const sku = `GOTH-${String(++seq).padStart(4, "0")}`;
    const row: CatalogRow = {
      sku,
      product_name: r.product_name,
      price: DEFAULT_PRICE,
      price_original: price_original || r.price_site || "",
      image: r.image,
      product_url: r.product_url,
      category,
      subcategory,
      brand,
      description: r.description,
    };
    const dedupeKey = `${r.product_name.toLowerCase()}|${r.product_url}`;
    if (!byName.has(dedupeKey)) byName.set(dedupeKey, row);
  }

  const catalog = [...byName.values()].sort((a, b) =>
    a.product_name.localeCompare(b.product_name, "en", { sensitivity: "base" }),
  );
  catalog.forEach((r, i) => {
    r.sku = `GOTH-${String(i + 1).padStart(4, "0")}`;
  });

  const root = process.cwd();
  const jsonPath = path.join(root, "catalogo_gotham_2599.json");
  const csvPath = path.join(root, "catalogo_gotham_2599.csv");

  writeFileSync(jsonPath, JSON.stringify(catalog, null, 2), "utf8");

  const header =
    "product_name,price,price_original,image,product_url,category,subcategory,brand,description";
  const lines = catalog.map((r) =>
    [
      escapeCsvCell(r.product_name),
      String(r.price),
      escapeCsvCell(r.price_original),
      escapeCsvCell(r.image),
      escapeCsvCell(r.product_url),
      escapeCsvCell(r.category),
      escapeCsvCell(r.subcategory),
      escapeCsvCell(r.brand),
      escapeCsvCell(r.description),
    ].join(","),
  );
  writeFileSync(csvPath, [header, ...lines].join("\n"), "utf8");

  console.log(`Wrote ${catalog.length} rows → ${jsonPath}`);
  console.log(`CSV → ${csvPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
