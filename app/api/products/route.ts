import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { productCatalogImageVisible } from "@/lib/product-image";

/** Catálogo completo: todos los productos en BD, con o sin foto publicada (`imagePending`). */
export async function GET() {
  const gate = await requireRole(Role.CLIENT);
  if ("error" in gate && gate.error) return gate.error;

  const rows = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      priceCents: true,
      compareAtPriceCents: true,
      promoBadge: true,
      stock: true,
      sku: true,
      barcode: true,
      imageUrl: true,
      imagePending: true,
      category: { select: { name: true, sortOrder: true } },
    },
  });

  const products = rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    compareAtPriceCents: p.compareAtPriceCents,
    promoBadge: p.promoBadge,
    stock: p.stock,
    sku: p.sku,
    barcode: p.barcode,
    imagePending: p.imagePending,
    imageUrl: productCatalogImageVisible(p.imagePending, p.imageUrl) ? p.imageUrl : null,
    category: p.category?.name ?? null,
    categorySortOrder: p.category?.sortOrder ?? 999999,
  }));

  return NextResponse.json(products, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
