/**
 * Importa catalogo_lavaplus_5999.json a Postgres (categorías Lava Big Boy / Lava Plus + productos).
 * Fotos: URLs directas del JSON → imagePending false (catálogo curado).
 *
 * Uso desde la raíz del repo:
 *   npx tsx prisma/import-lavaplus-5999.ts
 */
import { readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { UNLIMITED_STOCK } from "../lib/product-stock";

const prisma = new PrismaClient();

type CatalogRow = {
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

async function main() {
  const filePath = path.join(process.cwd(), "catalogo_lavaplus_5999.json");
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

  let n = 0;
  for (const r of rows) {
    const cat = await prisma.category.findUnique({ where: { name: r.subcategory } });
    const priceCents = Math.round(r.price * 100);
    const desc = `${r.brand} · ${r.category} · ${r.subcategory}. Origen listado: lavaplusvape.com`;

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
        barcode: r.barcode,
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
        barcode: r.barcode,
      },
    });
    n++;
  }

  console.log(`Lava Plus import: ${n} productos (SKU LAVA-****). Categorías: ${subcats.join(", ")}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
