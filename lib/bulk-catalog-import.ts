import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { PrismaClient } from "@prisma/client";
import {
  isForbiddenStockImageUrl,
  isTechnicallyDirectProductImageUrl,
  isTrustedOperatorUploadImageUrl,
} from "@/lib/product-image";
import {
  MAX_CATALOG_IMAGE_BYTES,
  normalizeCatalogImageBuffer,
} from "@/lib/catalog-asset-ingest";

export type BulkImportInputRow = {
  category?: unknown;
  brand?: unknown;
  product_name?: unknown;
  description?: unknown;
  pack_size?: unknown;
  price?: unknown;
  sku?: unknown;
  barcode?: unknown;
  stock?: unknown;
  source_url?: unknown;
  source_image_url?: unknown;
  local_image_path?: unknown;
};

export type BulkImportRowResult = {
  brand: string;
  product_name: string;
  pack_size: string;
  price: string;
  source_url: string;
  source_image_url: string;
  image: string;
  image_status: string;
  status: "draft" | "active";
  outcome: "created" | "updated" | "skipped_duplicate" | "error";
  error?: string;
};

export type BulkImportSummary = {
  totalRead: number;
  created: number;
  updated: number;
  withPhoto: number;
  withoutPhoto: number;
  draft: number;
  active: number;
  skippedDuplicate: number;
  errors: number;
  rows: BulkImportRowResult[];
};

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function emptyToNull(s: string): string | null {
  return s === "" ? null : s;
}

function slugPart(s: string, max = 40): string {
  const t = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
  return t || "x";
}

function dedupeKey(brand: string, name: string, pack: string): string {
  return `${brand.toLowerCase()}|${name.toLowerCase()}|${pack.toLowerCase()}`;
}

function parsePrice(v: unknown): { ok: true; cents: number } | { ok: false; error: string } {
  if (v === undefined || v === null || v === "") {
    return { ok: false, error: "price missing" };
  }
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "price not numeric" };
  }
  return { ok: true, cents: Math.round(n * 100) };
}

function parseStock(v: unknown): number {
  if (v === undefined || v === null || v === "") return 25;
  const n = typeof v === "number" ? v : Math.floor(Number(v));
  if (!Number.isFinite(n)) return 25;
  return Math.max(0, n);
}

async function fetchBuffer(url: string, ms: number): Promise<Buffer> {
  const ac = AbortSignal.timeout(ms);
  const r = await fetch(url, {
    signal: ac,
    redirect: "follow",
    headers: {
      "User-Agent": "SellerProUS-CatalogImport/1.0 (+https://sellerprous.com)",
      Accept: "image/*,*/*;q=0.8",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

async function tryResolveImageUrlFromProductPage(productPageUrl: string): Promise<string | null> {
  try {
    const buf = await fetchBuffer(productPageUrl, 25_000);
    const html = buf.toString("utf8");
    const m1 = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (m1?.[1]) return m1[1].trim();
    const m2 = html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (m2?.[1]) return m2[1].trim();
    return null;
  } catch {
    return null;
  }
}

async function maybeOptimizeJpeg(buf: Buffer): Promise<Buffer> {
  try {
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default;
    return await sharp(buf)
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  } catch {
    return buf;
  }
}

/** Prefer JPEG en disco para consistencia; si sharp falla, conserva bytes y extensión originales. */
async function toStoredImage(norm: Awaited<ReturnType<typeof normalizeCatalogImageBuffer>>): Promise<{
  buffer: Buffer;
  ext: string;
}> {
  if (!norm) throw new Error("invalid image");
  const buf = Buffer.from(norm.bytes);
  if (norm.contentType === "image/jpeg") {
    return { buffer: await maybeOptimizeJpeg(buf), ext: ".jpg" };
  }
  try {
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default;
    const jpeg = await sharp(buf)
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    return { buffer: jpeg, ext: ".jpg" };
  } catch {
    return { buffer: buf, ext: norm.ext };
  }
}

async function saveProductImage(args: {
  brand: string;
  productName: string;
  packSize: string;
  buffer: Buffer;
  ext: string;
}): Promise<string> {
  const short = createHash("sha256").update(args.buffer).digest("hex").slice(0, 10);
  const base = `${slugPart(args.brand)}-${slugPart(args.productName)}-${slugPart(args.packSize || "default")}-${short}${args.ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "products");
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, base);
  await writeFile(full, args.buffer);
  return `/uploads/products/${base}`;
}

async function ingestImageForRow(
  row: BulkImportInputRow,
  brand: string,
  productName: string,
  packSize: string,
): Promise<
  | { ok: true; imageUrl: string; sourceImageUrl: string | null }
  | { ok: false; reason: string; sourceImageUrl: string | null }
> {
  let sourceImageUrl: string | null = emptyToNull(str(row.source_image_url));
  const localPath = emptyToNull(str(row.local_image_path));

  if (localPath) {
    const abs = path.isAbsolute(localPath) ? localPath : path.join(process.cwd(), localPath);
    const raw = await readFile(abs);
    const norm = await normalizeCatalogImageBuffer(new Uint8Array(raw), MAX_CATALOG_IMAGE_BYTES);
    if (!norm) return { ok: false, reason: "local file not a valid image", sourceImageUrl: null };
    const stored = await toStoredImage(norm);
    const rel = await saveProductImage({
      brand,
      productName,
      packSize,
      buffer: stored.buffer,
      ext: stored.ext,
    });
    return { ok: true, imageUrl: rel, sourceImageUrl: sourceImageUrl ?? `file:${localPath}` };
  }

  let downloadUrl: string | null = null;
  if (sourceImageUrl) {
    if (isForbiddenStockImageUrl(sourceImageUrl)) {
      return { ok: false, reason: "forbidden image host", sourceImageUrl };
    }
    if (!isTechnicallyDirectProductImageUrl(sourceImageUrl)) {
      return {
        ok: false,
        reason: "source_image_url must be a direct https image (.jpg/.png/.webp/.gif)",
        sourceImageUrl,
      };
    }
    downloadUrl = sourceImageUrl;
  } else {
    const productUrl = emptyToNull(str(row.source_url));
    if (productUrl) {
      const og = await tryResolveImageUrlFromProductPage(productUrl);
      if (og && isTechnicallyDirectProductImageUrl(og) && !isForbiddenStockImageUrl(og)) {
        downloadUrl = og;
        sourceImageUrl = og;
      }
    }
  }

  if (!downloadUrl) {
    return { ok: false, reason: "no image URL and no og:image from source_url", sourceImageUrl };
  }

  const raw = await fetchBuffer(downloadUrl, 30_000);
  if (raw.byteLength > MAX_CATALOG_IMAGE_BYTES) {
    return { ok: false, reason: "downloaded image too large", sourceImageUrl };
  }
  const norm = await normalizeCatalogImageBuffer(new Uint8Array(raw), MAX_CATALOG_IMAGE_BYTES);
  if (!norm) return { ok: false, reason: "download not a valid image", sourceImageUrl };
  const stored = await toStoredImage(norm);
  const rel = await saveProductImage({
    brand,
    productName,
    packSize,
    buffer: stored.buffer,
    ext: stored.ext,
  });
  return { ok: true, imageUrl: rel, sourceImageUrl };
}

function summarizeRows(rows: BulkImportRowResult[]): Pick<
  BulkImportSummary,
  | "withPhoto"
  | "withoutPhoto"
  | "draft"
  | "active"
  | "created"
  | "updated"
  | "skippedDuplicate"
  | "errors"
> {
  let created = 0;
  let updated = 0;
  let skippedDuplicate = 0;
  let errors = 0;
  let withPhoto = 0;
  let withoutPhoto = 0;
  let draft = 0;
  let active = 0;
  for (const r of rows) {
    if (r.outcome === "created") created++;
    else if (r.outcome === "updated") updated++;
    else if (r.outcome === "skipped_duplicate") skippedDuplicate++;
    else if (r.outcome === "error") errors++;
    if (r.image && r.image_status === "ready") withPhoto++;
    else withoutPhoto++;
    if (r.status === "active") active++;
    else draft++;
  }
  return { created, updated, skippedDuplicate, errors, withPhoto, withoutPhoto, draft, active };
}

export async function runBulkImportFromRows(
  prisma: PrismaClient,
  rows: BulkImportInputRow[],
): Promise<BulkImportSummary> {
  const results: BulkImportRowResult[] = [];
  const seenInFile = new Set<string>();

  const maxSort = (await prisma.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  let nextSort = maxSort + 1;

  for (const raw of rows) {
    const categoryName = str(raw.category);
    const brand = str(raw.brand);
    const productName = str(raw.product_name);
    const packSize = str(raw.pack_size);
    const description = str(raw.description) || "—";
    const sourceUrl = str(raw.source_url);

    const key = dedupeKey(brand, productName, packSize);
    if (seenInFile.has(key)) {
      results.push({
        brand,
        product_name: productName,
        pack_size: packSize,
        price: str(raw.price),
        source_url: sourceUrl,
        source_image_url: str(raw.source_image_url),
        image: "",
        image_status: "pending",
        status: "draft",
        outcome: "skipped_duplicate",
        error: "duplicate row in same file",
      });
      continue;
    }
    seenInFile.add(key);

    if (!categoryName || !brand || !productName) {
      results.push({
        brand,
        product_name: productName,
        pack_size: packSize,
        price: str(raw.price),
        source_url: sourceUrl,
        source_image_url: str(raw.source_image_url),
        image: "",
        image_status: "pending",
        status: "draft",
        outcome: "error",
        error: "category, brand and product_name are required",
      });
      continue;
    }

    const priceRes = parsePrice(raw.price);
    if (!priceRes.ok) {
      results.push({
        brand,
        product_name: productName,
        pack_size: packSize,
        price: str(raw.price),
        source_url: sourceUrl,
        source_image_url: str(raw.source_image_url),
        image: "",
        image_status: "pending",
        status: "draft",
        outcome: "error",
        error: priceRes.error,
      });
      continue;
    }

    if (priceRes.cents <= 0) {
      results.push({
        brand,
        product_name: productName,
        pack_size: packSize,
        price: str(raw.price),
        source_url: sourceUrl,
        source_image_url: str(raw.source_image_url),
        image: "",
        image_status: "pending",
        status: "draft",
        outcome: "error",
        error: "price must be > 0",
      });
      continue;
    }

    let cat = await prisma.category.findUnique({ where: { name: categoryName } });
    if (!cat) {
      cat = await prisma.category.create({
        data: { name: categoryName, sortOrder: nextSort++ },
      });
    }

    const sku = emptyToNull(str(raw.sku));
    const barcode = emptyToNull(str(raw.barcode));
    const stock = parseStock(raw.stock);
    const packNull = packSize === "" ? null : packSize;

    const existing = await prisma.product.findFirst({
      where: { brand, name: productName, packSize: packNull },
    });

    const wantsNewImage =
      !!str(raw.local_image_path) || !!str(raw.source_image_url) || !!str(raw.source_url);
    const existingTrusted =
      existing &&
      !existing.imagePending &&
      existing.imageUrl &&
      isTrustedOperatorUploadImageUrl(existing.imageUrl);

    let imageUrl: string | null = existing?.imageUrl ?? null;
    let imagePending = existing?.imagePending ?? true;
    let imageStatus = existing?.imageStatus ?? "pending";
    let sourceImageUrlDb: string | null = existing?.sourceImageUrl ?? null;
    let ingestError: string | undefined;

    if (existingTrusted && !wantsNewImage) {
      imageUrl = existing!.imageUrl;
      imagePending = false;
      imageStatus = "ready";
    } else {
      try {
        const ing = await ingestImageForRow(raw, brand, productName, packSize);
        if (ing.ok) {
          imageUrl = ing.imageUrl;
          imagePending = false;
          imageStatus = "ready";
          sourceImageUrlDb = ing.sourceImageUrl ?? sourceImageUrlDb;
        } else {
          ingestError = ing.reason;
          if (ing.sourceImageUrl) sourceImageUrlDb = ing.sourceImageUrl;
          if (!existingTrusted) {
            imageUrl = null;
            imagePending = true;
            imageStatus = "pending";
          }
        }
      } catch (e) {
        ingestError = e instanceof Error ? e.message : String(e);
        if (!existingTrusted) {
          imageUrl = null;
          imagePending = true;
          imageStatus = "pending";
        }
      }
    }

    const criticalOk =
      priceRes.cents > 0 &&
      !imagePending &&
      !!imageUrl &&
      isTrustedOperatorUploadImageUrl(imageUrl) &&
      isTechnicallyDirectProductImageUrl(imageUrl);

    const listingStatus = criticalOk ? "published" : "draft";
    const catalogPublished = criticalOk;

    const data = {
      name: productName,
      description,
      priceCents: priceRes.cents,
      compareAtPriceCents: null as number | null,
      promoBadge: null as string | null,
      categoryId: cat.id,
      stock,
      imageUrl,
      imagePending,
      imageStatus,
      brand,
      packSize: packNull,
      sourceUrl: emptyToNull(sourceUrl),
      sourceImageUrl: sourceImageUrlDb,
      sku,
      barcode,
      catalogPublished,
      listingStatus,
    };

    const statusLabel: "draft" | "active" = criticalOk ? "active" : "draft";

    try {
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        results.push({
          brand,
          product_name: productName,
          pack_size: packSize,
          price: (priceRes.cents / 100).toFixed(2),
          source_url: sourceUrl,
          source_image_url: sourceImageUrlDb ?? "",
          image: imageUrl ?? "",
          image_status: imageStatus,
          status: statusLabel,
          outcome: "updated",
          ...(ingestError && !criticalOk ? { error: ingestError } : {}),
        });
      } else {
        await prisma.product.create({ data });
        results.push({
          brand,
          product_name: productName,
          pack_size: packSize,
          price: (priceRes.cents / 100).toFixed(2),
          source_url: sourceUrl,
          source_image_url: sourceImageUrlDb ?? "",
          image: imageUrl ?? "",
          image_status: imageStatus,
          status: statusLabel,
          outcome: "created",
          ...(ingestError && !criticalOk ? { error: ingestError } : {}),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        brand,
        product_name: productName,
        pack_size: packSize,
        price: (priceRes.cents / 100).toFixed(2),
        source_url: sourceUrl,
        source_image_url: sourceImageUrlDb ?? "",
        image: imageUrl ?? "",
        image_status: imageStatus,
        status: "draft",
        outcome: "error",
        error: msg,
      });
    }
  }

  const counts = summarizeRows(results);
  return {
    totalRead: rows.length,
    rows: results,
    ...counts,
  };
}
