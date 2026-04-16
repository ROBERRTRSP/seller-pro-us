/**
 * Catálogo Bluntville / D'ville según https://www.bluntville.com/our-story — todo a $25.99.
 *
 *   npm run db:import:bluntville-our-story
 *
 * Dedupe: marca + nombre + pack_size. Sin SKU ni imágenes (foto pendiente).
 * En producción: Admin → Productos → «Importar Bluntville / D'ville 25.99 (esta BD)».
 */
import { PrismaClient } from "@prisma/client";
import { importBluntvilleOurStoryCatalog } from "../lib/bluntville-our-story-catalog";

const prisma = new PrismaClient();

async function main() {
  const r = await importBluntvilleOurStoryCatalog(prisma);
  console.log(JSON.stringify(r, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
