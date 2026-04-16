/**
 * Importa prisma/data/jr-backwoods-draft.json: Backwoods en borrador (sin imagen publicada,
 * visibles en tienda; imagen sigue pendiente hasta subir/verificar en Admin).
 *
 *   npx tsx prisma/import-jr-backwoods-draft.ts
 */
import { readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = {
  category: string;
  brand: string;
  product_name: string;
  description: string;
  size: string | null;
  pack_size: string | null;
  price: number | null;
  compare_at_price: number | null;
  sku: string;
  source_url: string;
  image_status: string;
  stock: number;
};

async function main() {
  const filePath = path.join(process.cwd(), "prisma/data/jr-backwoods-draft.json");
  const rows = JSON.parse(readFileSync(filePath, "utf8")) as Row[];

  const maxSort = (await prisma.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  await prisma.category.upsert({
    where: { name: "Tobacco" },
    create: { name: "Tobacco", sortOrder: maxSort + 1 },
    update: {},
  });
  const cat = await prisma.category.findUnique({ where: { name: "Tobacco" } });
  if (!cat) throw new Error("Tobacco category missing");

  let n = 0;
  for (const r of rows) {
    const priceCents =
      r.price != null && Number.isFinite(r.price) ? Math.round(r.price * 100) : 0;
    const compareAtPriceCents =
      r.compare_at_price != null && Number.isFinite(r.compare_at_price)
        ? Math.round(r.compare_at_price * 100)
        : null;
    if (compareAtPriceCents != null && compareAtPriceCents <= priceCents) {
      throw new Error(`Invalid compare vs price for SKU ${r.sku}`);
    }

    await prisma.product.upsert({
      where: { sku: r.sku },
      create: {
        name: r.product_name,
        description: r.description.trim() || "—",
        priceCents,
        compareAtPriceCents,
        promoBadge: null,
        categoryId: cat.id,
        stock: Math.max(0, Math.floor(r.stock)),
        imageUrl: null,
        imagePending: true,
        imageStatus: r.image_status,
        brand: r.brand,
        size: r.size,
        packSize: r.pack_size,
        sourceUrl: r.source_url,
        ageRestricted: true,
        minimumAge: 21,
        catalogPublished: true,
        listingStatus: "published",
        sku: r.sku,
        barcode: null,
      },
      update: {
        name: r.product_name,
        description: r.description.trim() || "—",
        priceCents,
        compareAtPriceCents,
        promoBadge: null,
        categoryId: cat.id,
        stock: Math.max(0, Math.floor(r.stock)),
        brand: r.brand,
        size: r.size,
        packSize: r.pack_size,
        sourceUrl: r.source_url,
        ageRestricted: true,
        minimumAge: 21,
        catalogPublished: true,
        listingStatus: "published",
        barcode: null,
      },
    });
    n++;
  }

  console.log(`Imported ${n} JR Backwoods products (Tobacco; visibles en tienda, foto puede seguir pendiente).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
