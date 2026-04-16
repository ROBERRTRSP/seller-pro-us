import type { PrismaClient } from "@prisma/client";
import { UNLIMITED_STOCK } from "@/lib/product-stock";
import catalogRows from "../catalogo_entourage_2599.json";

type CatalogRow = {
  sku: string;
  product_name: string;
  price: number;
  image: string;
  product_url: string;
  category: string;
  subcategory: string;
  brand: string;
};

const rows = catalogRows as CatalogRow[];

/**
 * Upsert Entourage 25.99 catalog (11 SKUs ENTO2599-*) into the given database.
 * Used by CLI (`prisma/import-entourage-2599.ts`) and Admin API (production).
 */
export async function importEntourage2599Catalog(prisma: PrismaClient): Promise<{
  imported: number;
  subcategories: string[];
  totalProducts: number;
}> {
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

  let n = 0;
  for (const r of rows) {
    const cat = await prisma.category.findUnique({ where: { name: r.subcategory } });
    const priceCents = Math.round(r.price * 100);
    const desc = `${r.brand} · ${r.category} · ${r.subcategory}. Origen: ${r.product_url}`;

    await prisma.product.upsert({
      where: { sku: r.sku },
      create: {
        name: r.product_name,
        description: desc,
        priceCents,
        compareAtPriceCents: null,
        promoBadge: null,
        categoryId: cat?.id ?? null,
        stock: UNLIMITED_STOCK,
        imageUrl: r.image,
        imagePending: false,
        catalogPublished: true,
        listingStatus: "published",
        sku: r.sku,
        brand: r.brand,
        sourceUrl: r.product_url,
        sourceImageUrl: r.image,
        ageRestricted: true,
      },
      update: {
        name: r.product_name,
        description: desc,
        priceCents,
        compareAtPriceCents: null,
        promoBadge: null,
        categoryId: cat?.id ?? null,
        stock: UNLIMITED_STOCK,
        imageUrl: r.image,
        imagePending: false,
        catalogPublished: true,
        listingStatus: "published",
        brand: r.brand,
        sourceUrl: r.product_url,
        sourceImageUrl: r.image,
        ageRestricted: true,
      },
    });
    n++;
  }

  const totalProducts = await prisma.product.count();

  return {
    imported: n,
    subcategories: subcats,
    totalProducts,
  };
}
