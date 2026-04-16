/**
 * Catálogo unificado Bluntville (our-story) + Backwoods (JR PLP) → JSON + CSV en la raíz del repo.
 *
 * Fuentes:
 *   - https://www.bluntville.com/our-story-1
 *   - https://www.jrcigars.com/cigars/machine-made-cigars/backwoods-cigars/ (+ página 2 opcional vía HTML)
 *
 * Precios fijos: Bluntville 25.99 | Backwoods 49.99
 *
 *   npx tsx scripts/build-catalogo-blunt-backwoods.ts
 *
 * Opcional:
 *   BLUNT_HTML_PATH=/ruta/saved.html  — HTML guardado si fetch falla
 *   JR_BACKWOODS_HTML=/ruta/p1.html  — PLP JR (p. ej. export desde navegador)
 *   JR_BACKWOODS_HTML_PAGE2=/ruta/p2.html
 *   SKIP_IMAGE_HEAD=1 — no validar imágenes con HTTP HEAD
 */
import { writeFileSync } from "fs";
import path from "path";
import { canonicalJrcigarsUrl, decodeHtmlEntities, stripTags } from "../prisma/jr-black-mild-plp-parse";

const BLUNT_URL = "https://www.bluntville.com/our-story-1";
const JR_BW_URL = "https://www.jrcigars.com/cigars/machine-made-cigars/backwoods-cigars/";
const OUT_JSON = "catalogo_blunt_backwoods.json";
const OUT_CSV = "catalogo_blunt_backwoods.csv";

const PRICE_BLUNT = 25.99;
const PRICE_BACK = 49.99;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type CatalogRow = {
  sku: string;
  product_name: string;
  price: number;
  brand: string;
  image: string;
  product_url: string;
  category: "cigarillo" | "cigar";
  subcategory: string;
  /** Presentación cuando la fuente la muestra (Bluntville / JR). */
  pack_size: string | null;
  description: string;
};

function isVapeName(s: string): boolean {
  const t = s.toLowerCase();
  return (
    t.includes("vape") ||
    t.includes("e-liquid") ||
    t.includes("e liquid") ||
    t.includes("disposable") ||
    t.includes("pod ") ||
    t.includes("geek bar") ||
    t.includes("elf bar")
  );
}

function normalizeSquarespaceImage(u: string): string {
  const x = u.startsWith("//") ? `https:${u}` : u;
  if (x.includes("?")) return x;
  return `${x}?format=1500w`;
}

function canonicalJrCdnFromAny(src: string): string | null {
  const s = decodeHtmlEntities(src).trim().replace(/&amp;/g, "&");
  const j = s.indexOf("https://www.jrcigars.com/dw/image");
  if (j >= 0) {
    let u = s.slice(j);
    const end = u.search(/["'\s>]/);
    if (end >= 0) u = u.slice(0, end);
    return u;
  }
  return null;
}

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, redirect: "follow" });
    return r.ok || r.status === 405;
  } catch {
    return false;
  }
}

/** Bluntville / D'ville desde HTML Squarespace (summary grid). */
function parseBluntvilleRows(html: string): CatalogRow[] {
  const rows: CatalogRow[] = [];
  const re =
    /href="(\/[^"]+)"[^>]*>[\s\S]*?data-image="(https:\/\/images\.squarespace-cdn\.com[^"]+)"[^>]*alt="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const rel = m[1];
    const rawImg = m[2];
    const altRaw = decodeHtmlEntities(m[3]).trim();
    if (!rawImg.match(/\/(BV_|BVC|DV_)/i)) continue;
    if (altRaw.toLowerCase().includes("logo")) continue;
    const image = normalizeSquarespaceImage(rawImg);
    const isDville = /\/DV_/i.test(rawImg);
    const brand = isDville ? "D'ville" : "Bluntville";
    const display = altRaw.replace(/\s+/g, " ");

    let product_url = rel.startsWith("http") ? rel : `https://www.bluntville.com${rel}`;
    if (!product_url.startsWith("http")) product_url = `https://www.bluntville.com/${rel.replace(/^\//, "")}`;

    const pos = m.index;
    const header = lastSectionBefore(html, pos);
    const pack =
      header?.pack === "4/6" ? "4/6 Pack" : header?.pack === "25" ? "25 Singles/Box" : "25 Singles/Box";
    const triple = isTripleLine(display, rawImg);
    const lineKind = header?.kind ?? "cigarillo";
    const sub = bluntSubcategory(display, rawImg, lineKind);
    let product_name: string;
    if (isDville) {
      product_name = `${brand} ${display} Cigars`.replace(/\s+/g, " ");
    } else if (triple) {
      const disp = display.replace(/^palma trio$/i, "Palma Trio");
      product_name = `Bluntville Triple Wrapped ${disp}`.replace(/\s+/g, " ");
    } else if (lineKind === "cigarillo") {
      product_name = `Bluntville ${display} Cigarillo`.replace(/\s+/g, " ");
    } else {
      product_name = `Bluntville ${display} Cigars`.replace(/\s+/g, " ");
    }

    const key = `${brand}|${product_name.toLowerCase()}|${pack}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      sku: "",
      product_name,
      price: PRICE_BLUNT,
      brand,
      image,
      product_url,
      category: "cigarillo",
      subcategory: isDville
        ? lineKind === "cigarillo"
          ? "Flavored Cigarillo"
          : "Natural Leaf Cigars"
        : sub,
      pack_size: pack,
      description: salesDescriptionBlunt(display, isDville),
    });
  }
  return rows;
}

type Sec = { index: number; pack: "25" | "4/6"; kind: "cigar" | "cigarillo" };

function lastSectionBefore(html: string, pos: number): Sec | null {
  const headers: Sec[] = [];
  const re = /<p class="text-align-center">([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = stripTags(m[1]).toLowerCase();
    if (!inner.includes("singles") && !inner.includes("4/6")) continue;
    const pack = inner.includes("4/6") ? ("4/6" as const) : ("25" as const);
    let kind: "cigar" | "cigarillo" = "cigar";
    if (inner.includes("cigarillo")) kind = "cigarillo";
    else if (/\bcigar\b/.test(inner)) kind = "cigar";
    headers.push({ index: m.index, pack, kind });
  }
  let best: Sec | null = null;
  for (const h of headers) {
    if (h.index <= pos && (!best || h.index >= best.index)) best = h;
  }
  return best;
}

function isTripleLine(display: string, rawImg: string): boolean {
  const d = display.toLowerCase();
  return /bvc/i.test(rawImg) || /triple|palma trio/.test(d);
}

function bluntSubcategory(
  display: string,
  rawImg: string,
  lineKind: "cigar" | "cigarillo",
): string {
  if (isTripleLine(display, rawImg)) return "Triple Wrapped";
  if (lineKind === "cigarillo") return "Flavored Cigarillo";
  return "Natural Leaf Cigars";
}

function salesDescriptionBlunt(line: string, dville: boolean): string {
  if (dville) {
    return `${line} — premium cigarillo line. Smooth draw, consistent quality; ideal for adult shoppers seeking a refined smoke.`;
  }
  return `${line} — machine-made cigarillo with bold flavor and an easy, slow-burn profile. OTC-style packaging as shown on Bluntville.`;
}

function* eachJrTile(html: string): Generator<string> {
  const marker = '<div class="item product-detail product-tile item"';
  let i = 0;
  while (true) {
    const start = html.indexOf(marker, i);
    if (start === -1) return;
    const next = html.indexOf(marker, start + marker.length);
    const block = next === -1 ? html.slice(start) : html.slice(start, next);
    yield block;
    if (next === -1) return;
    i = next;
  }
}

function firstMatch(html: string, re: RegExp): string | null {
  const x = html.match(re);
  return x ? x[1] : null;
}

function parseJrBackwoods(html: string): CatalogRow[] {
  const byId = new Map<string, CatalogRow>();
  for (const block of eachJrTile(html)) {
    const idM = block.match(/data-itemid="([^"]+)"/);
    if (!idM) continue;
    const jrId = decodeHtmlEntities(idM[1]).trim();
    const variant = stripTags(firstMatch(block, /<div class="item-desc2">\s*([\s\S]*?)<\/div>/i) ?? "").trim();
    if (!variant || isVapeName(variant)) continue;

    const packRaw = firstMatch(block, /<div class="item-pack text-grey">\s*([\s\S]*?)<\/div>/i);
    const pack_size = packRaw ? stripTags(packRaw) : null;

    const href =
      firstMatch(block, /<a href="([^"]+)"[^>]*class="[^"]*product-tile-link/) ??
      firstMatch(block, /class="[^"]*product-tile-link[^"]*"[^>]*href="([^"]+)"/);
    const product_url = href ? canonicalJrcigarsUrl(href) ?? `${JR_BW_URL}` : `${JR_BW_URL}`;

    const srcM =
      block.match(/src="([^"]+jrcigars\.com[^"]+)"/i) ||
      block.match(/src="([^"]*web\.archive\.org[^"]+jrcigars\.com[^"]+)"/i);
    const cdn = srcM ? canonicalJrCdnFromAny(srcM[1]) : null;
    if (!cdn) continue;

    const product_name = `Backwoods ${variant} Cigars`;
    const sub = backwoodsSubcategory(variant);

    byId.set(jrId, {
      sku: "",
      product_name,
      price: PRICE_BACK,
      brand: "Backwoods",
      image: cdn,
      product_url,
      category: "cigar",
      subcategory: sub,
      pack_size,
      description: salesDescriptionBackwoods(variant),
    });
  }
  return [...byId.values()];
}

function backwoodsSubcategory(variant: string): string {
  const v = variant.toLowerCase();
  const sweet =
    /honey|berry|sweet|grape|banana|russian|cream|stout|wine|cherry|apple|vanilla|honey bourbon|dark stout/i.test(
      v,
    );
  if (/original|^natural\b|russet/i.test(v)) return "Natural Leaf Cigars";
  if (/rustic|rough|leaf\s*only/i.test(v)) return "Rustic Cigars";
  if (sweet) return "Sweet Aromatic";
  return "Natural Leaf Cigars";
}

function salesDescriptionBackwoods(variant: string): string {
  return `Premium natural leaf cigar — ${variant}. Rich aroma, slow burn, and the classic Backwoods profile adult consumers expect.`;
}

function assignSkus(rows: CatalogRow[]): void {
  let blunt = 0;
  let dv = 0;
  let back = 0;
  for (const r of rows) {
    if (r.brand === "Bluntville") {
      blunt++;
      r.sku = `BLUNT-${String(blunt).padStart(4, "0")}`;
    } else if (r.brand === "D'ville") {
      dv++;
      r.sku = `DVIL-${String(dv).padStart(4, "0")}`;
    } else if (r.brand === "Backwoods") {
      back++;
      r.sku = `BACK-${String(back).padStart(4, "0")}`;
    }
  }
}

function toCsv(rows: CatalogRow[]): string {
  const cols = [
    "sku",
    "product_name",
    "price",
    "brand",
    "image",
    "product_url",
    "category",
    "subcategory",
    "pack_size",
    "description",
  ] as const;
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(
      [
        esc(r.sku),
        esc(r.product_name),
        String(r.price),
        esc(r.brand),
        esc(r.image),
        esc(r.product_url),
        esc(r.category),
        esc(r.subcategory),
        esc(r.pack_size ?? ""),
        esc(r.description),
      ].join(","),
    );
  }
  return lines.join("\n");
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return r.text();
}

async function main() {
  const root = process.cwd();
  const skipHead = process.env.SKIP_IMAGE_HEAD === "1";

  let bluntHtml = "";
  const bluntPath = process.env.BLUNT_HTML_PATH?.trim();
  if (bluntPath) {
    bluntHtml = await import("fs/promises").then((fs) => fs.readFile(path.resolve(bluntPath), "utf8"));
  } else {
    bluntHtml = await fetchText(BLUNT_URL);
  }

  const jrParts: string[] = [];
  const jr1 = process.env.JR_BACKWOODS_HTML?.trim();
  if (jr1) {
    jrParts.push(await import("fs/promises").then((fs) => fs.readFile(path.resolve(jr1), "utf8")));
  } else {
    const way = process.env.JR_BACKWOODS_WAYBACK_SNAPSHOT?.trim() || "20231210181231";
    const u = `https://web.archive.org/web/${way}/https://www.jrcigars.com/cigars/machine-made-cigars/backwoods-cigars/?start=0&sz=20`;
    try {
      jrParts.push(await fetchText(u));
    } catch {
      throw new Error(
        `No se pudo descargar JR Backwoods (${u}). Guarda el HTML del PLP y usa JR_BACKWOODS_HTML=/ruta/archivo.html`,
      );
    }
  }
  const jr2 = process.env.JR_BACKWOODS_HTML_PAGE2?.trim();
  if (jr2) {
    jrParts.push(await import("fs/promises").then((fs) => fs.readFile(path.resolve(jr2), "utf8")));
  }

  const bluntRows = parseBluntvilleRows(bluntHtml);
  const jrRows = jrParts.flatMap((h) => parseJrBackwoods(h));

  const merged = [...bluntRows, ...jrRows];
  assignSkus(merged);

  const bad: string[] = [];
  if (!skipHead) {
    for (const r of merged) {
      const ok = await headOk(r.image);
      if (!ok) bad.push(r.product_name);
      await new Promise((res) => setTimeout(res, 40));
    }
  }

  writeFileSync(path.join(root, OUT_JSON), JSON.stringify(merged, null, 2), "utf8");
  writeFileSync(path.join(root, OUT_CSV), toCsv(merged), "utf8");

  console.log(
    JSON.stringify(
      {
        bluntville_lines: bluntRows.length,
        backwoods_lines: jrRows.length,
        total: merged.length,
        image_head_failures: bad.length,
        failed_images: bad.slice(0, 12),
        out_json: OUT_JSON,
        out_csv: OUT_CSV,
      },
      null,
      2,
    ),
  );
  if (bad.length) {
    console.warn(
      "Algunas imágenes no respondieron OK al HEAD (CDN puede bloquear HEAD). Revisa URLs o exporta con SKIP_IMAGE_HEAD=1.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
