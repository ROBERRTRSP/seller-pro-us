/**
 * Importa `catalogo_entourage_2599.json` a Postgres (categorías por subcategory + productos).
 * SKU en JSON: prefijo ENTO2599-* para no chocar con el catálogo legacy ENTO-0009..0014 (packs).
 *
 * Requiere DATABASE_URL. Desde la raíz:
 *   npm run db:import:entourage-2599
 */
import { readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { UNLIMITED_STOCK } from "../lib/product-stock";

const prisma = new PrismaClient();

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

async function main() {
  const filePath = path.join(process.cwd(), "catalogo_entourage_2599.json");
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

  console.log(
    `Entourage 25.99 import: ${n} productos (SKU ENTO2599-*). Categorías: ${subcats.join(", ")}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
