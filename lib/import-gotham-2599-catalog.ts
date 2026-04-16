import { readFileSync } from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";
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

/**
 * Upsert catálogo Gotham 25.99 (`catalogo_gotham_2599.json`) en Postgres.
 * Categorías Prisma = `subcategory` del JSON (p. ej. Premium Cigars).
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
    await prisma.$transaction(
      chunk.map((r) => {
        const categoryId = catByName.get(r.subcategory) ?? null;
        const priceCents = Math.round(r.price * 100);
        const desc =
          (r.description?.trim() || "").length > 0
            ? `${r.description.trim()}\n\nGotham Cigars · ${r.category} · ${r.subcategory}. Precio listado (referencia): ${r.price_original || "—"}. ${r.product_url}`
            : `${r.brand} · ${r.category} · ${r.subcategory}. Precio listado (referencia): ${r.price_original || "—"}. ${r.product_url}`;

        return prisma.product.upsert({
          where: { sku: r.sku },
          create: {
            name: r.product_name.trim(),
            description: desc.slice(0, 8000),
            priceCents,
            compareAtPriceCents: null,
            promoBadge: null,
            categoryId,
            stock: UNLIMITED_STOCK,
            imageUrl: r.image,
            imagePending: false,
            catalogPublished: true,
            listingStatus: "published",
            sku: r.sku,
            brand: r.brand.trim() || null,
            sourceUrl: r.product_url,
            sourceImageUrl: r.image,
            ageRestricted: true,
            minimumAge: 21,
          },
          update: {
            name: r.product_name.trim(),
            description: desc.slice(0, 8000),
            priceCents,
            compareAtPriceCents: null,
            promoBadge: null,
            categoryId,
            stock: UNLIMITED_STOCK,
            imageUrl: r.image,
            imagePending: false,
            catalogPublished: true,
            listingStatus: "published",
            brand: r.brand.trim() || null,
            sourceUrl: r.product_url,
            sourceImageUrl: r.image,
            ageRestricted: true,
            minimumAge: 21,
          },
        });
      }),
    );
    n += chunk.length;
  }

  const totalProducts = await prisma.product.count();
  return { imported: n, subcategories: subcats, totalProducts };
}
