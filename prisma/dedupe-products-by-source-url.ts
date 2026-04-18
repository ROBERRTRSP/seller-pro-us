/**
 * Fusiona productos duplicados con el mismo sourceUrl (canónico).
 * Mantiene un ganador por URL, reasigna OrderItem y elimina el resto.
 *
 *   npx tsx prisma/dedupe-products-by-source-url.ts
 *
 * Requiere DATABASE_URL. Ejecutar después de backups en producción.
 */
import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { normalizeSourceUrl } from "../lib/normalize-source-url";

const prisma = new PrismaClient();

type ProductRow = Awaited<ReturnType<typeof prisma.product.findMany>>[number];

function bucketKey(sourceUrl: string | null): string | null {
  return normalizeSourceUrl(sourceUrl);
}

function pickWinner(group: ProductRow[]): ProductRow {
  return [...group].sort((a, b) => {
    const sc = (b.salesCount ?? 0) - (a.salesCount ?? 0);
    if (sc !== 0) return sc;
    if (Boolean(a.catalogPublished) !== Boolean(b.catalogPublished)) {
      return a.catalogPublished ? -1 : 1;
    }
    const img = Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
    if (img !== 0) return img;
    return b.createdAt.getTime() - a.createdAt.getTime();
  })[0]!;
}

async function reassignOrderItems(
  tx: Prisma.TransactionClient,
  fromProductId: string,
  toProductId: string,
) {
  const items = await tx.orderItem.findMany({ where: { productId: fromProductId } });
  for (const it of items) {
    const existing = await tx.orderItem.findFirst({
      where: { orderId: it.orderId, productId: toProductId },
    });
    if (existing && existing.id !== it.id) {
      await tx.orderItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + it.quantity },
      });
      await tx.orderItem.delete({ where: { id: it.id } });
    } else {
      await tx.orderItem.update({
        where: { id: it.id },
        data: { productId: toProductId },
      });
    }
  }
}

async function main() {
  const products = await prisma.product.findMany({
    where: { sourceUrl: { not: null } },
  });

  const byBucket = new Map<string, ProductRow[]>();
  for (const p of products) {
    const key = bucketKey(p.sourceUrl);
    if (!key) continue;
    const arr = byBucket.get(key);
    if (arr) arr.push(p);
    else byBucket.set(key, [p]);
  }

  let groups = 0;
  let removed = 0;

  for (const [canonicalUrl, group] of byBucket) {
    if (group.length < 2) continue;
    groups++;
    const winner = pickWinner(group);
    const losers = group.filter((p) => p.id !== winner.id);

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: winner.id },
        data: { sourceUrl: canonicalUrl },
      });

      for (const loser of losers) {
        await reassignOrderItems(tx, loser.id, winner.id);
        await tx.product.delete({ where: { id: loser.id } });
        removed++;
      }
    });
  }

  const total = await prisma.product.count();
  console.log(
    `Dedupe por sourceUrl: ${groups} grupos con duplicados, ${removed} filas eliminadas. Total productos ahora: ${total}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
