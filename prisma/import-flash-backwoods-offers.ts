/**
 * Ofertas tipo «Flash» para la tienda: Backwoods City Packs / Select con
 * precio «antes» y precio actual (aparecen en #flash-ofertas si compareAt > price).
 *
 *   npx tsx prisma/import-flash-backwoods-offers.ts
 *
 * Upsert por sku fijo (no inventado: es código interno de import).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORY = "Tobacco";

type Row = {
  sku: string;
  name: string;
  priceCents: number;
  compareAtPriceCents: number;
  stock: number;
};

const ROWS: Row[] = [
  {
    sku: "flash-bw-city-la-aromatic",
    name: "Backwoods City Packs L.A. Aromatic",
    priceCents: 4399,
    compareAtPriceCents: 6680,
    stock: 25,
  },
  {
    sku: "flash-bw-city-sweet-summertime-chi",
    name: "Backwoods City Packs Sweet Summertime Chi",
    priceCents: 4599,
    compareAtPriceCents: 7016,
    stock: 0,
  },
  {
    sku: "flash-bw-city-purple-pack-houston",
    name: "Backwoods City Packs The Purple Pack Houston",
    priceCents: 4599,
    compareAtPriceCents: 7016,
    stock: 0,
  },
  {
    sku: "flash-bw-select-guatemala-satin",
    name: "Backwoods Select Guatemala Satin",
    priceCents: 4399,
    compareAtPriceCents: 6590,
    stock: 25,
  },
  {
    sku: "flash-bw-select-honduras-1883-3pk",
    name: "Backwoods Select Honduras 1883 3pk",
    priceCents: 4399,
    compareAtPriceCents: 6590,
    stock: 25,
  },
  {
    sku: "flash-bw-select-philippines-prestige",
    name: "Backwoods Select Philippines Prestige 3/10pk",
    priceCents: 4399,
    compareAtPriceCents: 6590,
    stock: 25,
  },
];

async function main() {
  const maxSort = (await prisma.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  await prisma.category.upsert({
    where: { name: CATEGORY },
    create: { name: CATEGORY, sortOrder: maxSort + 1 },
    update: {},
  });
  const cat = await prisma.category.findUnique({ where: { name: CATEGORY } });
  if (!cat) throw new Error("Category missing");

  let n = 0;
  for (const r of ROWS) {
    await prisma.product.upsert({
      where: { sku: r.sku },
      create: {
        sku: r.sku,
        name: r.name,
        description: `${r.name}. Oferta flash (import). Tabaco para mayores de edad.`,
        priceCents: r.priceCents,
        compareAtPriceCents: r.compareAtPriceCents,
        promoBadge: "Flash Ofertas",
        categoryId: cat.id,
        stock: r.stock,
        barcode: null,
        imageUrl: null,
        imagePending: true,
        imageStatus: "pending-permission",
        brand: "Backwoods",
        catalogPublished: true,
        ageRestricted: true,
        minimumAge: 21,
      },
      update: {
        name: r.name,
        priceCents: r.priceCents,
        compareAtPriceCents: r.compareAtPriceCents,
        promoBadge: "Flash Ofertas",
        categoryId: cat.id,
        stock: r.stock,
        brand: "Backwoods",
        catalogPublished: true,
        ageRestricted: true,
        minimumAge: 21,
      },
    });
    n++;
  }
  console.log(`OK: ${n} productos flash Backwoods (upsert por sku).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
