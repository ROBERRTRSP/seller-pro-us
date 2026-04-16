/**
 * Parser for JR Cigars Demandware PLP tiles (Black & Mild category).
 * Only reads on-page text/attributes — no image URLs are returned.
 */

export type JrBmAvailability = "in_stock" | "backorder" | "sold_out";

export type ParsedJrBlackMildTile = {
  jrItemId: string;
  sourceUrl: string | null;
  variantLine: string;
  size: string | null;
  packSize: string | null;
  priceUsd: number | null;
  availability: JrBmAvailability;
};

export function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&times;/g, "×")
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip tags; keep text nodes flattened (PLP tiles are shallow). */
export function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "));
}

/**
 * Resolve canonical https://www.jrcigars.com/... from href (relative, absolute, or Wayback-wrapped).
 */
export function canonicalJrcigarsUrl(href: string): string | null {
  const h = decodeHtmlEntities(href).trim();
  const wm = h.match(/\/web\/\d+(?:[a-z]{2}_)?\/(https:\/\/www\.jrcigars\.com\/[^"'#?\s]+(?:\?[^"'#]*)?)/i);
  if (wm) return wm[1];
  if (/^https:\/\/www\.jrcigars\.com\//i.test(h)) return h.split("#")[0] ?? h;
  if (h.startsWith("/") && !h.startsWith("//")) {
    const path = h.split("?")[0] ?? h;
    const qs = h.includes("?") ? h.slice(h.indexOf("?")) : "";
    return `https://www.jrcigars.com${path}${qs}`;
  }
  return null;
}

function* eachProductTile(html: string): Generator<string> {
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
  const m = html.match(re);
  return m ? m[1] : null;
}

function tileAvailability(block: string): JrBmAvailability {
  const vc = firstMatch(block, /<div class="variant-container"([\s\S]*?)<\/div>\s*<\/div>/i);
  const chunk = vc ? `variant-container${vc}` : block;
  const low = chunk.toLowerCase();
  if (low.includes("sold out") && (low.includes('disabled="disabled"') || low.includes("disabled='disabled'")))
    return "sold_out";
  if (low.includes("sold out") && /<a[^>]*class="[^"]*btn[^"]*btn-blk/i.test(chunk)) return "sold_out";
  if (low.includes("backorder") || low.includes("back order")) return "backorder";
  return "in_stock";
}

function parsePrice(block: string): number | null {
  const m = block.match(/itemprop="price"\s+content="([0-9]+(?:\.[0-9]+)?)"/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export type ParseJrBlackMildResult = {
  tiles: ParsedJrBlackMildTile[];
  /** Repeated `data-itemid` in the same HTML export (e.g. duplicate layouts). */
  droppedDuplicateTiles: number;
};

/**
 * Parse one or more PLP HTML documents. Deduplicates by JR `data-itemid` (first tile wins).
 */
export function parseJrBlackMildPlpHtmlDocuments(htmlParts: string[]): ParseJrBlackMildResult {
  const bySku = new Map<string, ParsedJrBlackMildTile>();
  let droppedDuplicateTiles = 0;

  for (const html of htmlParts) {
    for (const block of eachProductTile(html)) {
      const idM = block.match(/data-itemid="([^"]+)"/);
      if (!idM) continue;
      const jrItemId = decodeHtmlEntities(idM[1]).trim();
      if (!jrItemId) continue;
      if (bySku.has(jrItemId)) {
        droppedDuplicateTiles++;
        continue;
      }

      const href =
        firstMatch(block, /<a href="([^"]+)"[^>]*class="[^"]*product-tile-link/) ??
        firstMatch(block, /class="[^"]*product-tile-link[^"]*"[^>]*href="([^"]+)"/);
      const sourceUrl = href ? canonicalJrcigarsUrl(href) : null;

      const variantLine =
        stripTags(firstMatch(block, /<div class="item-desc2">\s*([\s\S]*?)<\/div>/i) ?? "").trim() ||
        stripTags(firstMatch(block, /\btitle="([^"]+)"/) ?? "").trim();

      const sizeRaw = firstMatch(block, /item-detail--size">\s*<span>\s*([\s\S]*?)<\/span>/i);
      const size = sizeRaw ? stripTags(sizeRaw) : null;

      const packRaw = firstMatch(block, /<div class="item-pack text-grey">\s*([\s\S]*?)<\/div>/i);
      const packSize = packRaw ? stripTags(packRaw) : null;

      bySku.set(jrItemId, {
        jrItemId,
        sourceUrl,
        variantLine,
        size,
        packSize,
        priceUsd: parsePrice(block),
        availability: tileAvailability(block),
      });
    }
  }

  return { tiles: [...bySku.values()], droppedDuplicateTiles };
}

export function buildProductDisplayName(tile: ParsedJrBlackMildTile): string {
  const v = tile.variantLine || "Black & Mild";
  return `Black & Mild — ${v}`;
}

/**
 * Single Prisma `name` field: variant + size + pack (PLP) + JR item id from `data-itemid`
 * (visible in HTML) so two lines with the same wording stay distinct.
 */
export function buildPrismaProductName(tile: ParsedJrBlackMildTile): string {
  const base = buildProductDisplayName(tile);
  const parts = [base, tile.size, tile.packSize].filter(Boolean);
  return `${parts.join(" — ")} (${tile.jrItemId})`;
}

export function buildDescription(tile: ParsedJrBlackMildTile): string {
  const bits = [
    "Machine-made filtered cigar (Black & Mild).",
    tile.size ? `Size: ${tile.size}.` : null,
    tile.packSize ? `Pack: ${tile.packSize}.` : null,
    "Listing imported from JR Cigars category page for reference; verify before sale.",
  ].filter(Boolean);
  return bits.join(" ");
}
