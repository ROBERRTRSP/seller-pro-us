import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

/**
 * Marca todos los productos como visibles en /tienda (`catalogPublished`).
 * Útil en producción: el script local solo toca la BD de tu .env local.
 */
export async function POST() {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const total = await prisma.product.count();
  const wereUnpublished = await prisma.product.count({ where: { catalogPublished: false } });
  const result = await prisma.product.updateMany({
    data: { catalogPublished: true, listingStatus: "published" },
  });

  return NextResponse.json({
    ok: true,
    updated: result.count,
    totalProducts: total,
    wereUnpublishedBefore: wereUnpublished,
  });
}
