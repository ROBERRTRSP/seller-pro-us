/**
 * Importa catalogo_gotham_2599.json a Postgres (SKU GOTH-* en el JSON; actualización estable por URL).
 *
 *   npm run db:import:gotham-2599
 *
 * Requiere DATABASE_URL. En producción usa la misma URL que la web (Vercel / .env).
 */
import { PrismaClient } from "@prisma/client";
import { importGotham2599Catalog } from "../lib/import-gotham-2599-catalog";

const prisma = new PrismaClient();

async function main() {
  const r = await importGotham2599Catalog(prisma);
  console.log(
    `Gotham 25.99 import: ${r.imported} productos. Categorías (${r.subcategories.length}): ${r.subcategories.slice(0, 8).join(", ")}… Total en BD: ${r.totalProducts}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
