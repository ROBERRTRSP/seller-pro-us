import { readFileSync } from "fs";
import path from "path";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATALOG_SECTION_ORDER } from "../lib/catalog-sections";
import {
  isForbiddenStockImageUrl,
  isTechnicallyDirectProductImageUrl,
} from "../lib/product-image";
import { UNLIMITED_STOCK } from "../lib/product-stock";

const prisma = new PrismaClient();

/** Migrate older promo labels / product names (Spanish → English). */
async function migrateDisplayStrings() {
  const badgeMap: [string, string][] = [
    ["Liquidación", "Clearance"],
    ["Precio reducido", "Reduced price"],
  ];
  for (const [from, to] of badgeMap) {
    await prisma.product.updateMany({ where: { promoBadge: from }, data: { promoBadge: to } });
  }

  const renames: { from: string; to: string }[] = [
    { from: "Auriculares inalámbricos", to: "Wireless headphones" },
    { from: "Teclado mecánico", to: "Mechanical keyboard" },
    { from: "Mouse ergonómico", to: "Ergonomic mouse" },
    { from: "Paris Hilton — Set de perfume (4 piezas)", to: "Paris Hilton — Perfume gift set (4 pc)" },
    { from: "MUK LUKS — Calcetas compresión (pack 2)", to: "MUK LUKS — Compression socks (2-pack)" },
    { from: "Ferrero Rocher — Caja 24 unidades", to: "Ferrero Rocher — Box of 24" },
    { from: "Beautiful — Olla de cocción lenta 4 Qt", to: "Beautiful — 4 Qt slow cooker" },
    { from: "Bose Ultra Open — Auriculares Bluetooth", to: "Bose Ultra Open — Bluetooth headphones" },
    { from: "LEGO 40821 — Ositos de amor (287 piezas)", to: "LEGO 40821 — Love Bears (287 pcs)" },
    { from: "Cate & Chloe — Aretes oro blanco 18k", to: "Cate & Chloe — White gold 18k earrings" },
    { from: "Set spa lavanda — 8 piezas", to: "Lavender spa set — 8 pieces" },
    { from: "Almohada lumbar «It's Mom-Plicated»", to: "Lumbar pillow «It's Mom-Plicated»" },
  ];
  for (const { from, to } of renames) {
    const row = await prisma.product.findFirst({ where: { name: from } });
    if (row) await prisma.product.update({ where: { id: row.id }, data: { name: to } });
  }
}

async function ensureCategories() {
  for (let i = 0; i < CATALOG_SECTION_ORDER.length; i++) {
    const name = CATALOG_SECTION_ORDER[i];
    await prisma.category.upsert({
      where: { name },
      update: { sortOrder: i },
      create: { name, sortOrder: i },
    });
  }
}

type SeedRow = {
  name: string;
  description: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  promoBadge: string | null;
  categoryName: string;
  stock: number;
  /** Solo si `imageVerified` (no usar fotos genéricas ni no comprobadas). */
  imageUrl?: string | null;
  imageVerified?: boolean;
  sku?: string | null;
  barcode?: string | null;
};

function seedPhotoFields(row: Pick<SeedRow, "imageUrl" | "imageVerified">): {
  imageUrl: string | null;
  imagePending: boolean;
} {
  if (row.imageVerified === true && row.imageUrl?.trim()) {
    const u = row.imageUrl.trim();
    if (isTechnicallyDirectProductImageUrl(u) && !isForbiddenStockImageUrl(u)) {
      return { imageUrl: u, imagePending: false };
    }
  }
  return { imageUrl: null, imagePending: true };
}

async function upsertProduct(row: SeedRow) {
  const cat = await prisma.category.findUnique({ where: { name: row.categoryName } });
  const data = {
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    compareAtPriceCents: row.compareAtPriceCents,
    promoBadge: row.promoBadge,
    stock: row.stock,
    categoryId: cat?.id ?? null,
    sku: row.sku?.trim() || null,
    barcode: row.barcode?.trim() || null,
  };

  const existing = row.sku
    ? await prisma.product.findUnique({ where: { sku: row.sku } })
    : await prisma.product.findFirst({ where: { name: row.name } });

  const keepPhoto =
    existing &&
    !existing.imagePending &&
    existing.imageUrl &&
    isTechnicallyDirectProductImageUrl(existing.imageUrl) &&
    !isForbiddenStockImageUrl(existing.imageUrl);

  const nextPhoto = keepPhoto
    ? { imageUrl: existing!.imageUrl!, imagePending: false as const }
    : seedPhotoFields(row);

  if (!existing) {
    await prisma.product.create({ data: { ...data, ...nextPhoto } });
  } else {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        description: data.description,
        priceCents: data.priceCents,
        compareAtPriceCents: data.compareAtPriceCents,
        promoBadge: data.promoBadge,
        categoryId: data.categoryId,
        stock: data.stock,
        sku: data.sku,
        barcode: data.barcode,
        imageUrl: nextPhoto.imageUrl,
        imagePending: nextPhoto.imagePending,
      },
    });
  }
}

const AAA_WHOLESALE_CATEGORIES = [
  "Candy & Snacks",
  "Beverages",
  "Food Service",
  "Smoke Accessories",
  "Automotive",
  "Fabric Care",
  "Health & Personal Care",
  "Household",
  "Electronics",
] as const;

async function ensureAaaWholesaleCategories() {
  const base = CATALOG_SECTION_ORDER.length;
  for (let i = 0; i < AAA_WHOLESALE_CATEGORIES.length; i++) {
    const name = AAA_WHOLESALE_CATEGORIES[i];
    await prisma.category.upsert({
      where: { name },
      update: { sortOrder: base + i },
      create: { name, sortOrder: base + i },
    });
  }
}

async function seedAaaWholesaleApril2026() {
  const filePath = path.join(process.cwd(), "prisma", "data", "aaa-wholesale-april-2026.json");
  const raw = readFileSync(filePath, "utf8");
  const rows = JSON.parse(raw) as Omit<SeedRow, "stock">[];
  for (const row of rows) {
    await upsertProduct({ ...row, stock: UNLIMITED_STOCK });
  }
  console.log(`Seed: AAA Wholesale Abril 2026 — ${rows.length} productos (SKU + código de barras).`);
}

async function main() {
  await migrateDisplayStrings();
  await ensureCategories();
  await ensureAaaWholesaleCategories();
  await seedAaaWholesaleApril2026();

  const hash = await bcrypt.hash("demo1234", 10);

  await prisma.user.upsert({
    where: { email: "admin@tienda.local" },
    update: { name: "Admin" },
    create: {
      email: "admin@tienda.local",
      password: hash,
      name: "Admin",
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: "cliente@tienda.local" },
    update: {
      name: "Demo shopper",
      phone: "(555) 010-0001",
      address: "123 Demostración St, Ciudad Demo, NY 10001",
      businessLicense: "BUS-NY-DEMO-1001",
      tobaccoLicense: "TOB-NY-DEMO-1001",
    },
    create: {
      email: "cliente@tienda.local",
      password: hash,
      name: "Demo shopper",
      role: Role.CLIENT,
      phone: "(555) 010-0001",
      address: "123 Demostración St, Ciudad Demo, NY 10001",
      businessLicense: "BUS-NY-DEMO-1001",
      tobaccoLicense: "TOB-NY-DEMO-1001",
    },
  });

  const legacy: SeedRow[] = [
    {
      name: "Wireless headphones",
      description: "Bluetooth 5.3, noise cancellation.",
      priceCents: 8999,
      compareAtPriceCents: 10999,
      promoBadge: "Rollback",
      categoryName: "Tech & gadgets",
      stock: 25,
    },
    {
      name: "Mechanical keyboard",
      description: "Linear switches, RGB backlight.",
      priceCents: 12900,
      compareAtPriceCents: 14900,
      promoBadge: "Reduced price",
      categoryName: "Spruce up your space",
      stock: 25,
    },
    {
      name: "Ergonomic mouse",
      description: "6 programmable buttons, 16K DPI sensor.",
      priceCents: 4590,
      compareAtPriceCents: 5590,
      promoBadge: "Clearance",
      categoryName: "Spruce up your space",
      stock: 25,
    },
  ];

  for (const p of legacy) {
    await upsertProduct(p);
  }

  const extra: SeedRow[] = [
    {
      name: "Paris Hilton — Perfume gift set (4 pc)",
      description: "Eau de parfum gift set.",
      priceCents: 1997,
      compareAtPriceCents: null,
      promoBadge: null,
      categoryName: "Beauty & fragrances",
      stock: 25,
    },
    {
      name: "Coach Signature Eau de Parfum 3.3 fl oz",
      description: "Women's fragrance.",
      priceCents: 5988,
      compareAtPriceCents: 11183,
      promoBadge: "Rollback",
      categoryName: "Beauty & fragrances",
      stock: 25,
    },
    {
      name: "MUK LUKS — Compression socks (2-pack)",
      description: "Sizes 6–10.",
      priceCents: 1047,
      compareAtPriceCents: null,
      promoBadge: null,
      categoryName: "Fashion & accessories",
      stock: 25,
    },
    {
      name: "Ferrero Rocher — Box of 24",
      description: "Milk chocolate and hazelnut.",
      priceCents: 1447,
      compareAtPriceCents: 1899,
      promoBadge: "Reduced price",
      categoryName: "100+ gifts for Mom",
      stock: 25,
    },
    {
      name: "Beautiful — 4 Qt slow cooker",
      description: "Touch display, white glaze.",
      priceCents: 3997,
      compareAtPriceCents: 4497,
      promoBadge: "Rollback",
      categoryName: "Popular home picks",
      stock: 25,
    },
    {
      name: "Bose Ultra Open — Bluetooth headphones",
      description: "IPX4, Driftwood Sand.",
      priceCents: 29900,
      compareAtPriceCents: null,
      promoBadge: null,
      categoryName: "Tech & gadgets",
      stock: 25,
    },
    {
      name: "LEGO 40821 — Love Bears (287 pcs)",
      description: "Gift set.",
      priceCents: 1384,
      compareAtPriceCents: 1888,
      promoBadge: "Clearance",
      categoryName: "Must-have gift sets",
      stock: 25,
    },
    {
      name: "Cate & Chloe — White gold 18k earrings",
      description: "Swarovski crystals.",
      priceCents: 1799,
      compareAtPriceCents: null,
      promoBadge: null,
      categoryName: "Jewelry & watches",
      stock: 25,
    },
    {
      name: "Lumbar pillow «It's Mom-Plicated»",
      description: "14×9 in, Way To Celebrate.",
      priceCents: 997,
      compareAtPriceCents: null,
      promoBadge: null,
      categoryName: "$15 & under",
      stock: 25,
    },
    {
      name: "Lavender spa set — 8 pieces",
      description: "Bath basket, lavender and chamomile scent.",
      priceCents: 2099,
      compareAtPriceCents: 2999,
      promoBadge: "Reduced price",
      categoryName: "Mother's Day gifts",
      stock: 25,
    },
  ];

  for (const p of extra) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (!existing) {
      await upsertProduct(p);
    }
  }

  const clientUser = await prisma.user.findUnique({
    where: { email: "cliente@tienda.local" },
  });
  const productRows = await prisma.product.findMany({ orderBy: { name: "asc" } });

  if (clientUser && productRows.length > 0 && (await prisma.order.count()) === 0) {
    const [a, b, c] = [
      productRows[0],
      productRows[1] ?? productRows[0],
      productRows[2] ?? productRows[0],
    ];

    const demos: {
      status: string;
      adminNote: string | null;
      lines: { productId: string; quantity: number; priceCents: number }[];
    }[] = [
      {
        status: "PENDIENTE",
        adminNote: "Demo order.",
        lines: [
          { productId: a.id, quantity: 1, priceCents: a.priceCents },
          { productId: b.id, quantity: 2, priceCents: b.priceCents },
        ],
      },
      {
        status: "ENVIADO",
        adminNote: null,
        lines: [{ productId: b.id, quantity: 1, priceCents: b.priceCents }],
      },
      {
        status: "COMPLETADO",
        adminNote: "Repeat customer.",
        lines: [
          { productId: c.id, quantity: 1, priceCents: c.priceCents },
          { productId: a.id, quantity: 1, priceCents: a.priceCents },
        ],
      },
      {
        status: "CANCELADO",
        adminNote: "Canceled at customer request.",
        lines: [{ productId: a.id, quantity: 3, priceCents: a.priceCents }],
      },
    ];

    for (const demo of demos) {
      const totalCents = demo.lines.reduce(
        (sum, it) => sum + it.priceCents * it.quantity,
        0,
      );
      await prisma.order.create({
        data: {
          userId: clientUser.id,
          status: demo.status,
          totalCents,
          adminNote: demo.adminNote,
          deliveryPhone: clientUser.phone,
          deliveryAddress: clientUser.address,
          deliveryBusinessLicense: clientUser.businessLicense,
          deliveryTobaccoLicense: clientUser.tobaccoLicense,
          items: { create: demo.lines },
        },
      });
    }
    console.log("Seed: 4 demo orders (PENDIENTE, ENVIADO, COMPLETADO, CANCELADO).");
  }

  console.log("Seed OK: admin@tienda.local / cliente@tienda.local — password: demo1234");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
