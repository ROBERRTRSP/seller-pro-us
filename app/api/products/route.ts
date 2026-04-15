import { NextResponse } from "next/server";
import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

/** Only products with a photo appear in the catalog (non-null, non-empty URL). */
const catalogPhotoWhere: Prisma.ProductWhereInput = {
  AND: [{ imageUrl: { not: null } }, { NOT: { imageUrl: "" } }],
};

export async function GET() {
  const gate = await requireRole(Role.CLIENT);
  if ("error" in gate && gate.error) return gate.error;

  const rows = await prisma.product.findMany({
    where: catalogPhotoWhere,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      priceCents: true,
      compareAtPriceCents: true,
      promoBadge: true,
      stock: true,
      imageUrl: true,
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
    imageUrl: p.imageUrl,
    category: p.category?.name ?? null,
    categorySortOrder: p.category?.sortOrder ?? 999999,
  }));

  return NextResponse.json(products, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
