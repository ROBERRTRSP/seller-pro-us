/**
 * Import Black & Mild PLP rows from JR Cigars category (pages 1–2) into Postgres as drafts
 * (no image URLs, no hotlinking). Uses on-page text only.
 *
 * Fetch modes (first that works):
 *   1) Live https://www.jrcigars.com/... (default)
 *   2) JR_BLACK_MILD_WAYBACK_SNAPSHOT=20231217033648 — archived HTML (may miss page 2)
 *   3) JR_BLACK_MILD_HTML_PAGE1 / JR_BLACK_MILD_HTML_PAGE2 — paths to HTML saved from your browser
 *
 *   npx tsx prisma/import-jr-black-mild-catalog.ts
 *
 * Requires DATABASE_URL. After schema change: `npx prisma migrate deploy && npx prisma generate`
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  buildDescription,
  buildPrismaProductName,
  buildProductDisplayName,
  parseJrBlackMildPlpHtmlDocuments,
  type ParsedJrBlackMildTile,
} from "./jr-black-mild-plp-parse";
import { UNLIMITED_STOCK } from "../lib/product-stock";

const prisma = new PrismaClient();

const CATEGORY_URL =
  "https://www.jrcigars.com/cigars/machine-made-cigars/filtered-cigars/black-and-mild-cigars/";

const BRAND = "Black & Mild";
const IMAGE_STATUS = "pending-permission";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function isIncapsulaBlockPage(html: string): boolean {
  return (
    html.includes("_Incapsula_Resource") ||
    html.includes("Incapsula incident") ||
    html.length < 4000
  );
}

async function fetchHtml(url: string): Promise<{ ok: boolean; html: string; status: number }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.jrcigars.com/",
    },
    redirect: "follow",
  });
  const html = await res.text();
  const ok = res.ok && !isIncapsulaBlockPage(html);
  return { ok, html, status: res.status };
}

function waybackWrap(snapshot: string, target: string): string {
  return `https://web.archive.org/web/${snapshot}/${target}`;
}

function stockForAvailability(a: ParsedJrBlackMildTile["availability"]): number {
  if (a === "sold_out") return 0;
  if (a === "backorder") return 0;
  return UNLIMITED_STOCK;
}

function markdownTable(rows: RowSummary[]): string {
  const header =
    "| product_name | size | pack_size | price | availability | status |\n| --- | --- | --- | --- | --- | --- |";
  const lines = rows.map(
    (r) =>
      `| ${escMd(r.product_name)} | ${escMd(r.size)} | ${escMd(r.pack_size)} | ${escMd(r.price)} | ${r.availability} | ${r.status} |`,
  );
  return [header, ...lines].join("\n");
}

function escMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

type RowSummary = {
  product_name: string;
  size: string;
  pack_size: string;
  price: string;
  availability: string;
  status: "draft";
};

async function main() {
  if (process.env.JR_BLACK_MILD_DRY_RUN === "1") {
    const p1 = process.env.JR_BLACK_MILD_HTML_PAGE1?.trim();
    if (!p1) {
      throw new Error("JR_BLACK_MILD_DRY_RUN=1 requires JR_BLACK_MILD_HTML_PAGE1=/path/to/saved.html");
    }
    const parts = [readFileSync(path.resolve(p1), "utf8")];
    const p2 = process.env.JR_BLACK_MILD_HTML_PAGE2?.trim();
    if (p2) parts.push(readFileSync(path.resolve(p2), "utf8"));
    const { tiles, droppedDuplicateTiles } = parseJrBlackMildPlpHtmlDocuments(parts);
    const summaries: RowSummary[] = tiles.map((tile) => ({
      product_name: buildProductDisplayName(tile),
      size: tile.size ?? "—",
      pack_size: tile.packSize ?? "—",
      price: tile.priceUsd != null ? `$${tile.priceUsd.toFixed(2)}` : "—",
      availability: tile.availability,
      status: "draft",
    }));
    console.log(JSON.stringify({ found: tiles.length, droppedDuplicateTiles }, null, 2));
    console.log("\n--- Resumen (tabla) ---\n");
    console.log(markdownTable(summaries));
    return;
  }

  const snapshot = process.env.JR_BLACK_MILD_WAYBACK_SNAPSHOT?.trim();
  const file1 = process.env.JR_BLACK_MILD_HTML_PAGE1?.trim();
  const file2 = process.env.JR_BLACK_MILD_HTML_PAGE2?.trim();

  const pageUrls: string[] = [];
  const htmlParts: string[] = [];
  let fetchMode: "live" | "wayback" | "file" = "live";

  if (file1) {
    fetchMode = "file";
    htmlParts.push(readFileSync(path.resolve(file1), "utf8"));
    pageUrls.push(`file:${path.resolve(file1)}`);
    if (file2) {
      htmlParts.push(readFileSync(path.resolve(file2), "utf8"));
      pageUrls.push(`file:${path.resolve(file2)}`);
    }
  } else {
    const liveP1 = `${CATEGORY_URL}?start=0&sz=20`;
    const liveP2 = `${CATEGORY_URL}?start=20&sz=20`;
    if (snapshot) {
      fetchMode = "wayback";
      const u1 = waybackWrap(snapshot, liveP1);
      const u2 = waybackWrap(snapshot, liveP2);
      pageUrls.push(u1, u2);
      const r1 = await fetchHtml(u1);
      if (!r1.ok) {
        throw new Error(
          `Wayback page 1 failed or empty (status ${r1.status}). Try another JR_BLACK_MILD_WAYBACK_SNAPSHOT or save HTML to JR_BLACK_MILD_HTML_PAGE1.`,
        );
      }
      htmlParts.push(r1.html);
      const r2 = await fetchHtml(u2);
      if (r2.ok && !isIncapsulaBlockPage(r2.html)) {
        htmlParts.push(r2.html);
      } else {
        console.warn(
          "Warning: Wayback page 2 missing or blocked; continuing with page 1 only. Save live HTML to JR_BLACK_MILD_HTML_PAGE2 for a full page-2 import.",
        );
      }
    } else {
      fetchMode = "live";
      pageUrls.push(liveP1, liveP2);
      const r1 = await fetchHtml(liveP1);
      if (!r1.ok) {
        throw new Error(
          [
            "Could not load live JR category page (bot protection / empty response).",
            "Options:",
            "  • Save page 1 (and page 2) HTML from your browser and set JR_BLACK_MILD_HTML_PAGE1 / JR_BLACK_MILD_HTML_PAGE2.",
            "  • Or set JR_BLACK_MILD_WAYBACK_SNAPSHOT=20231217033648 for an archived snapshot (page 2 may be missing).",
          ].join("\n"),
        );
      }
      htmlParts.push(r1.html);
      const r2 = await fetchHtml(liveP2);
      if (r2.ok && !isIncapsulaBlockPage(r2.html)) {
        htmlParts.push(r2.html);
      } else {
        console.warn(
          "Warning: Live page 2 not loaded; continuing with page 1 only. Re-run after saving JR_BLACK_MILD_HTML_PAGE2, or try from a network that is not blocked.",
        );
      }
    }
  }

  const { tiles, droppedDuplicateTiles } = parseJrBlackMildPlpHtmlDocuments(htmlParts);
  const categoryFallbackUrl = CATEGORY_URL;

  const maxSort = (await prisma.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  await prisma.category.upsert({
    where: { name: "Tobacco" },
    create: { name: "Tobacco", sortOrder: maxSort + 1 },
    update: {},
  });
  const cat = await prisma.category.findUnique({ where: { name: "Tobacco" } });
  if (!cat) throw new Error("Tobacco category missing");

  let created = 0;
  let updated = 0;
  let skippedCollision = 0;
  const errors: string[] = [];

  const summaries: RowSummary[] = [];

  for (const tile of tiles) {
    if (tile.priceUsd == null || !Number.isFinite(tile.priceUsd)) {
      errors.push(`${tile.jrItemId}: no price in PLP tile; skipped (no invented price).`);
      continue;
    }
    const name = buildPrismaProductName(tile);
    const description = buildDescription(tile);
    const priceCents = Math.round(tile.priceUsd * 100);
    const sourceUrl = tile.sourceUrl ?? categoryFallbackUrl;
    const stock = stockForAvailability(tile.availability);

    try {
      const existing = await prisma.product.findUnique({ where: { sku: tile.jrItemId } });
      if (existing) {
        if (existing.brand && existing.brand !== BRAND) {
          skippedCollision++;
          errors.push(`SKU ${tile.jrItemId} already used by non–Black & Mild row; skipped.`);
          continue;
        }
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            priceCents,
            availability: tile.availability,
            sourceUrl,
            stock,
          },
        });
        updated++;
      } else {
        await prisma.product.create({
          data: {
            name,
            description,
            sku: tile.jrItemId,
            barcode: null,
            priceCents,
            compareAtPriceCents: null,
            promoBadge: null,
            categoryId: cat.id,
            stock,
            imageUrl: null,
            imagePending: true,
            imageStatus: IMAGE_STATUS,
            brand: BRAND,
            size: tile.size,
            packSize: tile.packSize,
            sourceUrl,
            ageRestricted: true,
            minimumAge: 21,
            catalogPublished: false,
            availability: tile.availability,
          },
        });
        created++;
      }
    } catch (e) {
      errors.push(`${tile.jrItemId}: ${e instanceof Error ? e.message : String(e)}`);
    }

    summaries.push({
      product_name: buildProductDisplayName(tile),
      size: tile.size ?? "—",
      pack_size: tile.packSize ?? "—",
      price: tile.priceUsd != null ? `$${tile.priceUsd.toFixed(2)}` : "—",
      availability: tile.availability,
      status: "draft",
    });
  }

  const logDir = path.join(process.cwd(), "prisma", "logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `jr-black-mild-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const logPayload = {
    fetchedAt: new Date().toISOString(),
    mode: fetchMode,
    referenceCategoryUrl: CATEGORY_URL,
    pageUrls,
    totals: {
      found: tiles.length,
      created,
      updated,
      droppedDuplicateTiles,
      skippedCollision,
      errors: errors.length,
    },
    errors,
    rows: summaries,
  };
  writeFileSync(logPath, JSON.stringify(logPayload, null, 2), "utf8");
  writeFileSync(path.join(logDir, "jr-black-mild-import-latest.json"), JSON.stringify(logPayload, null, 2), "utf8");

  console.log("\n--- JR Black & Mild import log ---");
  console.log(JSON.stringify(logPayload.totals, null, 2));
  console.log(`\nWrote: ${logPath}`);
  if (errors.length) console.log("\nWarnings / errors:\n", errors.join("\n"));

  console.log("\n--- Resumen (tabla) ---\n");
  console.log(markdownTable(summaries));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
