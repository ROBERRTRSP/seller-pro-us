import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATALOG_SECTION_ORDER } from "../lib/catalog-sections";
import { hasValidProductImage } from "../lib/product-image";

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
  imageUrl: string;
};

async function upsertProduct(row: SeedRow) {
  const cat = await prisma.category.findUnique({ where: { name: row.categoryName } });
  const data = {
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    compareAtPriceCents: row.compareAtPriceCents,
    promoBadge: row.promoBadge,
    stock: row.stock,
    imageUrl: row.imageUrl,
    categoryId: cat?.id ?? null,
  };

  const existing = await prisma.product.findFirst({ where: { name: row.name } });
  if (!existing) {
    await prisma.product.create({ data });
  } else {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        description: data.description,
        priceCents: data.priceCents,
        compareAtPriceCents: data.compareAtPriceCents,
        promoBadge: data.promoBadge,
        categoryId: data.categoryId,
        stock: data.stock,
        imageUrl: hasValidProductImage(existing.imageUrl) ? existing.imageUrl : data.imageUrl,
      },
    });
  }
}

async function main() {
  await migrateDisplayStrings();
  await ensureCategories();

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
    update: { name: "Demo shopper" },
    create: {
      email: "cliente@tienda.local",
      password: hash,
      name: "Demo shopper",
      role: Role.CLIENT,
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
      imageUrl: "https://picsum.photos/id/39/600/450",
    },
    {
      name: "Mechanical keyboard",
      description: "Linear switches, RGB backlight.",
      priceCents: 12900,
      compareAtPriceCents: 14900,
      promoBadge: "Reduced price",
      categoryName: "Spruce up your space",
      stock: 25,
      imageUrl: "https://picsum.photos/id/60/600/450",
    },
    {
      name: "Ergonomic mouse",
      description: "6 programmable buttons, 16K DPI sensor.",
      priceCents: 4590,
      compareAtPriceCents: 5590,
      promoBadge: "Clearance",
      categoryName: "Spruce up your space",
      stock: 25,
      imageUrl: "https://picsum.photos/id/96/600/450",
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
      imageUrl: "https://picsum.photos/id/64/600/450",
    },
    {
      name: "Coach Signature Eau de Parfum 3.3 fl oz",
      description: "Women's fragrance.",
      priceCents: 5988,
      compareAtPriceCents: 11183,
      promoBadge: "Rollback",
      categoryName: "Beauty & fragrances",
      stock: 25,
      imageUrl: "https://picsum.photos/id/65/600/450",
    },
    {
      name: "MUK LUKS — Compression socks (2-pack)",
      description: "Sizes 6–10.",
      priceCents: 1047,
      compareAtPriceCents: null,
      promoBadge: null,
      categoryName: "Fashion & accessories",
      stock: 25,
      imageUrl: "https://picsum.photos/id/338/600/450",
    },
    {
      name: "Ferrero Rocher — Box of 24",
      description: "Milk chocolate and hazelnut.",
      priceCents: 1447,
      compareAtPriceCents: 1899,
      promoBadge: "Reduced price",
      categoryName: "100+ gifts for Mom",
      stock: 25,
      imageUrl: "https://picsum.photos/id/431/600/450",
    },
    {
      name: "Beautiful — 4 Qt slow cooker",
      description: "Touch display, white glaze.",
      priceCents: 3997,
      compareAtPriceCents: 4497,
      promoBadge: "Rollback",
      categoryName: "Popular home picks",
      stock: 25,
      imageUrl: "https://picsum.photos/id/312/600/450",
    },
    {
      name: "Bose Ultra Open — Bluetooth headphones",
      description: "IPX4, Driftwood Sand.",
      priceCents: 29900,
      compareAtPriceCents: null,
      promoBadge: null,
      categoryName: "Tech & gadgets",
      stock: 25,
      imageUrl: "https://picsum.photos/id/181/600/450",
    },
    {
      name: "LEGO 40821 — Love Bears (287 pcs)",
      description: "Gift set.",
      priceCents: 1384,
      compareAtPriceCents: 1888,
      promoBadge: "Clearance",
      categoryName: "Must-have gift sets",
      stock: 25,
      imageUrl: "https://picsum.photos/id/193/600/450",
    },
    {
      name: "Cate & Chloe — White gold 18k earrings",
      description: "Swarovski crystals.",
      priceCents: 1799,
      compareAtPriceCents: null,
      promoBadge: null,
      categoryName: "Jewelry & watches",
      stock: 25,
      imageUrl: "https://picsum.photos/id/102/600/450",
    },
    {
      name: "Lumbar pillow «It's Mom-Plicated»",
      description: "14×9 in, Way To Celebrate.",
      priceCents: 997,
      compareAtPriceCents: null,
      promoBadge: null,
      categoryName: "$15 & under",
      stock: 25,
      imageUrl: "https://picsum.photos/id/106/600/450",
    },
    {
      name: "Lavender spa set — 8 pieces",
      description: "Bath basket, lavender and chamomile scent.",
      priceCents: 2099,
      compareAtPriceCents: 2999,
      promoBadge: "Reduced price",
      categoryName: "Mother's Day gifts",
      stock: 25,
      imageUrl: "https://picsum.photos/id/152/600/450",
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
