import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { importGotham2599Catalog } from "@/lib/import-gotham-2599-catalog";

/** Importa el JSON Gotham (~1500 filas); puede tardar >30s en serverless. Preferible: `npm run db:import:gotham-2599` con DATABASE_URL de prod. */
export async function POST() {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const result = await importGotham2599Catalog(prisma);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const maxDuration = 300;
