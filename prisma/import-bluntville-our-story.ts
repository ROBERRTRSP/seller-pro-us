/**
 * Crea o actualiza el catálogo fijo Bluntville / D'ville (referencia
 * https://www.bluntville.com/our-story-1#our-story ) con precio 25.99 USD y visibles en tienda.
 *
 *   npx tsx prisma/import-bluntville-our-story.ts
 *
 * Dedupe: brand + name (product_name) + pack_size. Sin SKU, barcode ni imágenes.
 */
import { PrismaClient } from "@prisma/client";
import { UNLIMITED_STOCK } from "../lib/product-stock";

const prisma = new PrismaClient();

const SOURCE_URL = "https://www.bluntville.com/our-story-1#our-story";
const PRICE_CENTS = 2599; // $25.99
const CATEGORY_NAME = "Tobacco";

type Row = { brand: string; product_name: string; pack_size: string };

const ROWS: Row[] = [
  { brand: "Bluntville", product_name: "Blueberry", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Candela Honey", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Grape", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Natural Deluxe", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Palma", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Pink Berry", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Sweet", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Vanilla", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "White Vanilla", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Natural Deluxe", pack_size: "4/6 Pack" },
  { brand: "Bluntville", product_name: "Palma", pack_size: "4/6 Pack" },
  { brand: "Bluntville", product_name: "Pink Berry", pack_size: "4/6 Pack" },
  { brand: "Bluntville", product_name: "Vanilla", pack_size: "4/6 Pack" },
  { brand: "Bluntville", product_name: "Sweet", pack_size: "4/6 Pack" },
  { brand: "Bluntville", product_name: "Blue", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Piff", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Pink Diva", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Triple Vanilla", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Palma Trio", pack_size: "25 Singles/Box" },
  { brand: "Bluntville", product_name: "Blue", pack_size: "4/6 Pack" },
  { brand: "Bluntville", product_name: "Piff", pack_size: "4/6 Pack" },
  { brand: "Bluntville", product_name: "Pink Diva", pack_size: "4/6 Pack" },
  { brand: "Bluntville", product_name: "Palma Trio", pack_size: "4/6 Pack" },
  { brand: "D'ville", product_name: "Black", pack_size: "25 Singles/Box" },
  { brand: "D'ville", product_name: "Gold", pack_size: "25 Singles/Box" },
  { brand: "D'ville", product_name: "Pink", pack_size: "25 Singles/Box" },
  { brand: "D'ville", product_name: "Black", pack_size: "4/6 Pack" },
  { brand: "D'ville", product_name: "Gold", pack_size: "4/6 Pack" },
  { brand: "D'ville", product_name: "Pink", pack_size: "4/6 Pack" },
];

function descriptionFor(r: Row): string {
  return `${r.brand} ${r.product_name}. Pack: ${r.pack_size}. Referencia: Bluntville (our story).`;
}

async function main() {
  const maxSort = (await prisma.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  await prisma.category.upsert({
    where: { name: CATEGORY_NAME },
    create: { name: CATEGORY_NAME, sortOrder: maxSort + 1 },
    update: {},
  });
  const cat = await prisma.category.findUnique({ where: { name: CATEGORY_NAME } });
  if (!cat) throw new Error("Tobacco category missing");

  const results: {
    brand: string;
    product_name: string;
    pack_size: string;
    price: string;
    action: "created" | "updated";
  }[] = [];

  let created = 0;
  let updated = 0;

  for (const r of ROWS) {
    const name = r.product_name.trim();
    const brand = r.brand.trim();
    const packSize = r.pack_size.trim();

    const existing = await prisma.product.findFirst({
      where: { brand, name, packSize },
      select: { id: true },
    });

    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          priceCents: PRICE_CENTS,
          sourceUrl: SOURCE_URL,
          catalogPublished: true,
          listingStatus: "published",
          categoryId: cat.id,
        },
      });
      updated++;
      results.push({
        brand,
        product_name: name,
        pack_size: packSize,
        price: "$25.99",
        action: "updated",
      });
    } else {
      await prisma.product.create({
        data: {
          name,
          description: descriptionFor(r),
          sku: null,
          barcode: null,
          priceCents: PRICE_CENTS,
          compareAtPriceCents: null,
          promoBadge: null,
          categoryId: cat.id,
          stock: UNLIMITED_STOCK,
          imageUrl: null,
          imagePending: true,
          imageStatus: "pending-permission",
          brand,
          size: null,
          packSize,
          sourceUrl: SOURCE_URL,
          ageRestricted: true,
          minimumAge: 21,
          catalogPublished: true,
          listingStatus: "published",
        },
      });
      created++;
      results.push({
        brand,
        product_name: name,
        pack_size: packSize,
        price: "$25.99",
        action: "created",
      });
    }
  }

  console.log(JSON.stringify({ created, updated, total: ROWS.length }, null, 2));
  console.log("\n| brand | product_name | pack_size | price | action |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const x of results) {
    console.log(
      `| ${x.brand} | ${x.product_name.replace(/\|/g, "\\|")} | ${x.pack_size.replace(/\|/g, "\\|")} | ${x.price} | ${x.action} |`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
