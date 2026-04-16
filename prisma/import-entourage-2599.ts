/**
 * Importa `catalogo_entourage_2599.json` a Postgres (categorías por subcategory + productos).
 * SKU en JSON: prefijo ENTO2599-* para no chocar con el catálogo legacy ENTO-0009..0014 (packs).
 *
 * Requiere DATABASE_URL. Desde la raíz:
 *   npm run db:import:entourage-2599
 *
 * En producción: Admin → Productos → «Importar Entourage 25.99 (esta BD)».
 */
import { PrismaClient } from "@prisma/client";
import { importEntourage2599Catalog } from "../lib/import-entourage-2599-catalog";

const prisma = new PrismaClient();

async function main() {
  const r = await importEntourage2599Catalog(prisma);
  console.log(
    `Entourage 25.99 import: ${r.imported} productos (SKU ENTO2599-*). Categorías: ${r.subcategories.join(", ")}. Total en BD: ${r.totalProducts}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
