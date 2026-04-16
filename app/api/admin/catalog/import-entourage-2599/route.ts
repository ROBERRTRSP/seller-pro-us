import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { importEntourage2599Catalog } from "@/lib/import-entourage-2599-catalog";

/**
 * Importa el catálogo Entourage 25.99 (11 productos, SKU ENTO2599-*) en la BD actual.
 * Útil en producción: mismo patrón que POST /api/admin/catalog/publish-all.
 */
export async function POST() {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const result = await importEntourage2599Catalog(prisma);
    return NextResponse.json({
      ok: true,
      imported: result.imported,
      subcategories: result.subcategories,
      totalProducts: result.totalProducts,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
