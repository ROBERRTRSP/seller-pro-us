/**
 * Marca todos los productos como visibles en el catálogo web (`catalogPublished`)
 * y en estado de listado publicado (`listingStatus`).
 *
 *   npx tsx prisma/publish-all-catalog.ts
 *
 * En producción: Admin → Productos → «Publicar todos en la tienda (esta BD)»
 * (POST /api/admin/catalog/publish-all), o ejecuta este script con DATABASE_URL de producción.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.product.count();
  const wasHidden = await prisma.product.count({ where: { catalogPublished: false } });

  const r = await prisma.product.updateMany({
    data: { catalogPublished: true, listingStatus: "published" },
  });

  const withApprovedPhoto = await prisma.product.count({
    where: { imagePending: false, NOT: { imageUrl: null } },
  });
  const photoPending = await prisma.product.count({
    where: { OR: [{ imagePending: true }, { imageUrl: null }] },
  });

  console.log(
    JSON.stringify(
      {
        totalProducts: total,
        rowsUpdated: r.count,
        wereUnpublishedBefore: wasHidden,
        withApprovedPhoto,
        photoStillPending: photoPending,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
