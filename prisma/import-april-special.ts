/**
 * Importa / actualiza productos «APRIL SPECIAL» (catálogo compartido por el usuario).
 * Imagen: todas las filas quedan con foto pendiente hasta subir archivo o URL verificada en Admin.
 * (Referencias Commons opcionales en `april-product-image-urls.ts` — no se aplican solas.)
 *
 * Uso: npx tsx prisma/import-april-special.ts
 */
import { PrismaClient } from "@prisma/client";
import { MAX_PROMO_BADGE_LEN } from "../lib/product-field-limits";

const prisma = new PrismaClient();

const PROMO = "APRIL SPECIAL";

/** [nombre, descripción, precio USD, categoría] */
const ROWS: [string, string, number, string][] = [
  ["Hershey's Milk Chocolate", "Caja de 36 unidades de chocolate Hershey's Milk Chocolate", 26.99, "Candy & Snacks"],
  ["Hershey's Cookies N Creme", "Caja de 36 unidades de chocolate Hershey's Cookies N Creme", 26.99, "Candy & Snacks"],
  ["Kit Kat", "Caja de 36 unidades de Kit Kat clásico", 27.99, "Candy & Snacks"],
  ["Kit Kat Vanilla", "Caja de 24 unidades de Kit Kat sabor vainilla", 27.99, "Candy & Snacks"],
  ["M&M's Minis Chocolate Plain", "Caja de 24 unidades de M&M's Minis Chocolate Plain", 20.99, "Candy & Snacks"],
  ["Almond Joy", "Caja de 24 unidades de Almond Joy", 21.99, "Candy & Snacks"],
  ["Takis Fuego", "Caja de 42 unidades de 2 oz, sabor Fuego", 29.99, "Club Size Snacks"],
  ["Oreo Chocolate Sandwich Cookies", "Caja de 30 unidades", 12.99, "Club Size Snacks"],
  ["Quest Frosted Cookies", "Caja de 8 unidades de 1.76 oz", 15.99, "High Protein Snacks"],
  ["Quest Protein Chips", "Caja de 10 unidades", 16.99, "High Protein Snacks"],
  ["Welch's Grape Sparkling Soda", "Caja de 24 botellas de 20 oz", 18.79, "Beverages"],
  ["Suero X", "Caja de 12 botellas de 21 oz, varios sabores", 18.99, "Beverages"],
  ["Foco Coconut Juice", "Caja de 24 latas de 11.8 oz", 21.99, "Beverages"],
  ["Nutrament", "Caja de 12 botellas de 17 oz, varios sabores", 19.99, "Beverages"],
  ["VS Splash", "Caja de 12 botellas de 16 oz, varios sabores", 10.99, "Beverages"],
  ["Waiakea Water 500 ML", "Caja de 24 botellas de 500 ml", 21.99, "Beverages"],
  ["Essentia Water 700 ML", "Caja de 24 botellas de 700 ml con sports cap", 25.99, "Beverages"],
  ["Fiji Water 500 ML", "Caja de 24 botellas de 500 ml", 21.39, "Beverages"],
  ["Domino Granulated Sugar 4 LB", "Fardo de 10 bolsas de 4 lb", 31.99, "Food Service"],
  ["Cafe Bustelo", "Caja de 24 unidades de 10 oz", 129.99, "Food Service"],
  ["Hellmann's Real Mayonnaise Jar", "Galón, 1 unidad", 18.99, "Food Service"],
  ["Nissin Cup Noodles", "Caja de 24 vasos, chicken, beef o shrimp", 10.99, "Food Service"],
  ["Raw Classic", "Caja de 50 unidades", 18.99, "Smoke Accessories"],
  ["Raw Classic Black", "Caja de 50 unidades", 19.99, "Smoke Accessories"],
  ["Mobil 1 Motor Oil", "Caja de 6 botellas de 1 qt", 34.99, "Automotive"],
  ["BlueDEF Diesel Exhaust Fluid", "Envase de 2.5 galones", 13.99, "Automotive"],
  ["Tide Simply All In One", "Botella de 115 oz", 14.99, "Fabric Care"],
  ["Downy Fabric Softener", "Caja de 4 unidades de 24 oz", 7.99, "Fabric Care"],
  ["Pepto Bismol", "Botella de 4 oz", 2.69, "Health & Personal Care"],
  ["Advil 200 MG", "Frasco de 50 cápsulas", 10.99, "Health & Personal Care"],
  ["Tylenol Extra Strength", "Caja de 50 caplets", 12.99, "Health & Personal Care"],
  ["Ajax Ultra", "Caja de 21 botellas de 12.6 oz", 21.99, "Household"],
  ["Lysol Wipes", "Caja de 4 paquetes de 75 wipes", 13.99, "Household"],
  ["Huggies Refreshing Wipes", "Caja de 1088 unidades", 25.99, "Household"],
  ["Earbuds", "Audífonos tipo earbuds", 10.99, "Electronics"],
  ["Car Charger", "Cargador para carro", 3.99, "Electronics"],
  ["Display 2024", "Display de accesorios para teléfono", 19.99, "Electronics"],
];

async function main() {
  const maxSort =
    (await prisma.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  let nextSort = maxSort + 1;
  const seenCat = new Set<string>();

  for (const [, , , catName] of ROWS) {
    if (seenCat.has(catName)) continue;
    seenCat.add(catName);
    await prisma.category.upsert({
      where: { name: catName },
      create: { name: catName, sortOrder: nextSort++ },
      update: {},
    });
  }

  let created = 0;
  let updated = 0;

  for (const [name, description, priceDollars, categoryName] of ROWS) {
    const category = await prisma.category.findUnique({ where: { name: categoryName } });
    if (!category) throw new Error(`Categoría no encontrada: ${categoryName}`);

    const priceCents = Math.round(priceDollars * 100);
    const stock = 0;
    const promoBadge = PROMO.slice(0, MAX_PROMO_BADGE_LEN);
    const existing = await prisma.product.findFirst({ where: { name } });
    const base = {
      description,
      priceCents,
      compareAtPriceCents: null as number | null,
      promoBadge,
      categoryId: category.id,
      stock,
      imageUrl: null as string | null,
      imagePending: true,
    };

    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data: base });
      updated++;
    } else {
      await prisma.product.create({ data: { name, ...base } });
      created++;
    }
  }

  console.log(`APRIL SPECIAL: ${created} creados, ${updated} actualizados (${ROWS.length} filas).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
