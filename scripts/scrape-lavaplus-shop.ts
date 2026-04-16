/**
 * Extrae el catálogo desde https://lavaplusvape.com/index.php/shop/ (paginación WooCommerce)
 * y genera catalogo_lavaplus_5999.json + .csv en la raíz del repo.
 *
 * Uso: npx tsx scripts/scrape-lavaplus-shop.ts
 */
import { writeFileSync } from "fs";
import path from "path";

const BASE = "https://lavaplusvape.com";
const SHOP = `${BASE}/index.php/shop/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FIXED_PRICE = 59.99;

type Row = {
  product_name: string;
  price_original: number;
  price: number;
  image: string;
  product_url: string;
  category: string;
  subcategory: string;
  brand: string;
  sku: string;
  barcode: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string): Promise<{ ok: boolean; html: string }> {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const html = await r.text();
  return { ok: r.ok, html };
}

function extractShopProductUrls(html: string): string[] {
  const out: string[] = [];
  const re = /href="(https:\/\/lavaplusvape\.com\/index\.php\/product\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = m[1].replace(/\/$/, "");
    if (!u.includes("/product/")) continue;
    out.push(u);
  }
  return [...new Set(out)];
}

function extractOgImage(html: string): string | null {
  const m = html.match(/property="og:image"\s+content="([^"]+)"/);
  return m ? m[1].trim() : null;
}

function extractProductTitle(html: string): string | null {
  const m = html.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([^<]+)<\/h1>/i);
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}

/** Precio principal (resumen), no productos relacionados. */
function extractPriceOriginal(html: string): number | null {
  const idx = html.indexOf('class="summary entry-summary"');
  if (idx === -1) return null;
  const end = html.indexOf('<section class="related products"', idx);
  const slice = end === -1 ? html.slice(idx, idx + 8000) : html.slice(idx, end);
  const m = slice.match(/woocommerce-Price-amount[^>]*>[\s\S]*?&#36;<\/span>([0-9]+(?:\.[0-9]{1,2})?)/);
  if (m) return parseFloat(m[1]);
  const m2 = slice.match(/woocommerce-Price-currencySymbol">\s*\$?\s*<\/span>([0-9]+(?:\.[0-9]{1,2})?)/);
  if (m2) return parseFloat(m2[1]);
  return null;
}

function toTitleCase(name: string): string {
  const small = new Set(["and", "or", "of", "the", "a", "an", "in", "on", "at", "to", "for"]);
  return name
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i !== 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function subcategoryFrom(name: string, slug: string): "Lava Big Boy" | "Lava Plus" {
  const n = name.toLowerCase();
  const s = slug.toLowerCase();
  if (n.includes("big boy") || s.includes("big-boy") || s.includes("lava-big-boy")) return "Lava Big Boy";
  return "Lava Plus";
}

function upgradeImageUrl(url: string): string {
  /** Quitar sufijo -WxH de WooCommerce si existe (mejor calidad). */
  return url.replace(/-(\d+)x(\d+)\.(jpe?g|png|webp)$/i, ".$3");
}

async function main() {
  const seen = new Set<string>();
  const productUrls: string[] = [];

  for (let page = 1; page <= 15; page++) {
    const url = page === 1 ? SHOP : `${BASE}/index.php/shop/page/${page}/`;
    const { ok, html } = await fetchText(url);
    if (!ok) break;
    const found = extractShopProductUrls(html);
    const newOnes = found.filter((u) => !seen.has(u));
    if (newOnes.length === 0) break;
    for (const u of newOnes) {
      seen.add(u);
      productUrls.push(u);
    }
    await sleep(400);
  }

  const rows: Row[] = [];

  for (const productUrl of productUrls) {
    const { ok, html } = await fetchText(productUrl + "/");
    if (!ok) {
      console.warn("HTTP error producto:", productUrl);
      continue;
    }
    const rawName = extractProductTitle(html);
    if (!rawName) {
      console.warn("Sin título:", productUrl);
      continue;
    }
    let image = extractOgImage(html);
    if (!image) {
      console.warn("Sin imagen og:", productUrl);
      continue;
    }
    image = upgradeImageUrl(image);
    const priceOriginal = extractPriceOriginal(html) ?? 0;
    const slug = productUrl.split("/product/")[1]?.replace(/\/$/, "") ?? "";
    const product_name = toTitleCase(rawName);
    const subcategory = subcategoryFrom(rawName, slug);
    rows.push({
      product_name,
      price_original: priceOriginal,
      price: FIXED_PRICE,
      image,
      product_url: productUrl + "/",
      category: "vape",
      subcategory,
      brand: "Lava",
      sku: "",
      barcode: "",
    });
    await sleep(350);
  }

  const byUrl = new Map<string, Row>();
  for (const r of rows) {
    if (!byUrl.has(r.product_url)) byUrl.set(r.product_url, r);
  }
  const unique = [...byUrl.values()].sort((a, b) => a.product_name.localeCompare(b.product_name));
  unique.forEach((r, i) => {
    const n = i + 1;
    r.sku = `LAVA-${String(n).padStart(4, "0")}`;
    r.barcode = String(800000000000 + n).slice(0, 12);
  });

  const root = path.join(process.cwd(), "catalogo_lavaplus_5999.json");
  const csvPath = path.join(process.cwd(), "catalogo_lavaplus_5999.csv");

  writeFileSync(root, JSON.stringify(unique, null, 2), "utf8");

  const header =
    "product_name,price,image,product_url,category,subcategory,brand,sku,barcode,price_original";
  const lines = unique.map((r) =>
    [
      csvEscape(r.product_name),
      r.price,
      csvEscape(r.image),
      csvEscape(r.product_url),
      csvEscape(r.category),
      csvEscape(r.subcategory),
      csvEscape(r.brand),
      csvEscape(r.sku),
      csvEscape(r.barcode),
      r.price_original,
    ].join(","),
  );
  writeFileSync(csvPath, [header, ...lines].join("\n"), "utf8");

  console.log(`Productos únicos: ${unique.length}`);
  console.log(`JSON: ${root}`);
  console.log(`CSV:  ${csvPath}`);
  if (unique.length < 55 || unique.length > 62) {
    console.warn(`Advertencia: se esperaban ~58 productos, hay ${unique.length}.`);
  }
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
