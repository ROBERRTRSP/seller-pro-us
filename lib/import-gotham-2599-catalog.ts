import { readFileSync } from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { normalizeSourceUrl } from "@/lib/normalize-source-url";
import { UNLIMITED_STOCK } from "@/lib/product-stock";

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

const BATCH = 80;

function buildDescription(r: CatalogRow): string {
  const desc =
    (r.description?.trim() || "").length > 0
      ? `${r.description.trim()}\n\nGotham Cigars · ${r.category} · ${r.subcategory}. Precio listado (referencia): ${r.price_original || "—"}. ${r.product_url}`
      : `${r.brand} · ${r.category} · ${r.subcategory}. Precio listado (referencia): ${r.price_original || "—"}. ${r.product_url}`;
  return desc.slice(0, 8000);
}

/** Identidad estable del listado = URL canónica; el SKU del JSON puede cambiar entre regeneraciones. */
async function upsertGothamProduct(
  tx: Prisma.TransactionClient,
  r: CatalogRow,
  categoryId: string | null,
): Promise<void> {
  const normUrl = normalizeSourceUrl(r.product_url);
  const rawTrim = r.product_url.trim();
  const storedUrl = normUrl ?? rawTrim;
  const priceCents = Math.round(r.price * 100);

  const dataCommon = {
    name: r.product_name.trim(),
    description: buildDescription(r),
    priceCents,
    compareAtPriceCents: null as null,
    promoBadge: null as null,
    categoryId,
    stock: UNLIMITED_STOCK,
    imageUrl: r.image,
    imagePending: false,
    catalogPublished: true,
    listingStatus: "published" as const,
    brand: r.brand.trim() || null,
    sourceUrl: storedUrl,
    sourceImageUrl: r.image,
    ageRestricted: true,
    minimumAge: 21,
  };

  const urlConditions: Prisma.ProductWhereInput[] = [];
  if (normUrl) urlConditions.push({ sourceUrl: normUrl });
  if (rawTrim && rawTrim !== normUrl) urlConditions.push({ sourceUrl: rawTrim });

  const byUrl =
    urlConditions.length > 0 ? await tx.product.findFirst({ where: { OR: urlConditions } }) : null;

  if (byUrl) {
    await tx.product.updateMany({
      where: { sku: r.sku, id: { not: byUrl.id } },
      data: { sku: null },
    });
    await tx.product.update({
      where: { id: byUrl.id },
      data: { ...dataCommon, sku: r.sku },
    });
    return;
  }

  const bySku = await tx.product.findUnique({ where: { sku: r.sku } });
  if (bySku) {
    await tx.product.update({
      where: { id: bySku.id },
      data: { ...dataCommon, sku: r.sku },
    });
    return;
  }

  await tx.product.create({
    data: {
      ...dataCommon,
      sku: r.sku,
    },
  });
}

/**
 * Importa Gotham (`catalogo_gotham_2599.json`): actualiza por URL de origen primero
 * para no duplicar filas cuando el JSON reenumera SKUs.
 */
export async function importGotham2599Catalog(prisma: PrismaClient): Promise<{
  imported: number;
  subcategories: string[];
  totalProducts: number;
}> {
  const filePath = path.join(process.cwd(), "catalogo_gotham_2599.json");
  const rows = JSON.parse(readFileSync(filePath, "utf8")) as CatalogRow[];

  const maxSort = (await prisma.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  let nextSort = maxSort + 1;
  const subcats = [...new Set(rows.map((r) => r.subcategory))].sort();

  for (const name of subcats) {
    await prisma.category.upsert({
      where: { name },
      create: { name, sortOrder: nextSort++ },
      update: {},
    });
  }

  const catByName = new Map(
    (await prisma.category.findMany({ where: { name: { in: subcats } } })).map((c) => [c.name, c.id]),
  );

  let n = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await prisma.$transaction(async (tx) => {
      for (const r of chunk) {
        const categoryId = catByName.get(r.subcategory) ?? null;
        await upsertGothamProduct(tx, r, categoryId);
      }
    });
    n += chunk.length;
  }

  const totalProducts = await prisma.product.count();
  return { imported: n, subcategories: subcats, totalProducts };
}
