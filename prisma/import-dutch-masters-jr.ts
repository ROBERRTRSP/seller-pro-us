/**
 * Importa `prisma/data/dutch-masters-jr-catalog.json` (listado Dutch Masters en JR Cigars).
 * Sin SKU inventado: deduplicación por brand + name + packSize (findFirst).
 * Re-import: actualiza solo price, availability, source_url en filas existentes.
 *
 *   npx tsx prisma/import-dutch-masters-jr.ts
 */
import { readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const AVAIL = new Set(["in_stock", "low_stock", "sold_out"]);

type Row = {
  category: string;
  brand: string;
  product_name: string;
  description: string;
  size: string | null;
  pack_size: string | null;
  price: number | null;
  availability: string;
  source_url: string;
  image: string;
  image_status: string;
  age_restricted: boolean;
  minimum_age: number;
  status: string;
};

function stockFromAvailability(a: string): number {
  if (a === "sold_out") return 0;
  if (a === "low_stock") return 4;
  return 25;
}

async function main() {
  const filePath = path.join(process.cwd(), "prisma/data/dutch-masters-jr-catalog.json");
  const rows = JSON.parse(readFileSync(filePath, "utf8")) as Row[];

  for (const r of rows) {
    if (r.category !== "Tobacco") throw new Error(`Unexpected category for ${r.product_name}`);
    if (r.brand !== "Dutch Masters") throw new Error(`Unexpected brand for ${r.product_name}`);
    if (!AVAIL.has(r.availability)) {
      throw new Error(`Invalid availability "${r.availability}" for ${r.product_name}`);
    }
    if (r.image?.trim()) throw new Error(`Image must be empty for ${r.product_name}`);
    if (r.image_status !== "pending-permission") {
      throw new Error(`Expected image_status pending-permission for ${r.product_name}`);
    }
  }

  const maxSort = (await prisma.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  await prisma.category.upsert({
    where: { name: "Tobacco" },
    create: { name: "Tobacco", sortOrder: maxSort + 1 },
    update: {},
  });
  const cat = await prisma.category.findUnique({ where: { name: "Tobacco" } });
  if (!cat) throw new Error("Tobacco category missing");

  let created = 0;
  let updated = 0;

  for (const r of rows) {
    const priceCents =
      r.price != null && Number.isFinite(r.price) ? Math.round(r.price * 100) : 0;

    const existing = await prisma.product.findFirst({
      where: {
        brand: r.brand,
        name: r.product_name,
        packSize: r.pack_size,
      },
    });

    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          priceCents,
          availability: r.availability,
          sourceUrl: r.source_url,
          catalogPublished: true,
          listingStatus: "published",
        },
      });
      updated++;
    } else {
      await prisma.product.create({
        data: {
          name: r.product_name,
          description: r.description.trim() || "—",
          priceCents,
          compareAtPriceCents: null,
          promoBadge: null,
          category: { connect: { id: cat.id } },
          stock: stockFromAvailability(r.availability),
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
          availability: r.availability,
          sku: null,
          barcode: null,
        },
      });
      created++;
    }
  }

  console.log(
    `Dutch Masters JR import: ${created} created, ${updated} updated (Tobacco; visibles en tienda; imagen pendiente).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
