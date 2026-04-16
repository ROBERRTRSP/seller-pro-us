import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { importBluntvilleOurStoryCatalog } from "@/lib/bluntville-our-story-catalog";

/** Importa / actualiza el catálogo fijo Bluntville + D'ville a $25.99 (misma BD que la web). */
export async function POST() {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const result = await importBluntvilleOurStoryCatalog(prisma);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
