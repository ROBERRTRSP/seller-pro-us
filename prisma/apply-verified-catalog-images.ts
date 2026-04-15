/**
 * Aplica en Postgres las URLs verificadas de `verified-catalog-images.ts`
 * para cada producto cuyo `name` coincide exactamente.
 *
 * Uso (desde la raíz del repo):
 *   npx tsx prisma/apply-verified-catalog-images.ts
 *
 * Requiere DATABASE_URL (p. ej. en .env).
 */
import { PrismaClient } from "@prisma/client";
import {
  isForbiddenStockImageUrl,
  isTechnicallyDirectProductImageUrl,
} from "../lib/product-image";
import { VERIFIED_CATALOG_IMAGES } from "./verified-catalog-images";

const prisma = new PrismaClient();

async function main() {
  let applied = 0;
  let skipped = 0;

  for (const [name, url] of Object.entries(VERIFIED_CATALOG_IMAGES)) {
    if (!isTechnicallyDirectProductImageUrl(url) || isForbiddenStockImageUrl(url)) {
      console.warn(`Omitido (URL no válida): ${name}`);
      skipped++;
      continue;
    }
    const r = await prisma.product.updateMany({
      where: { name },
      data: { imageUrl: url, imagePending: false },
    });
    if (r.count > 0) {
      applied += r.count;
      console.log(`OK: ${name}`);
    }
  }

  console.log(`\nListo: ${applied} fila(s) actualizada(s). (${skipped} URL omitidas por validación)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
