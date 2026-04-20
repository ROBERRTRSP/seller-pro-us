import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export async function GET() {
  const gate = await requireRole(Role.CLIENT);
  if ("error" in gate && gate.error) return gate.error;

  const row = await prisma.siteSettings.findUnique({
    where: { id: "default" },
    select: { minimumOrderCents: true },
  });
  const minimumOrderCents = Math.max(0, row?.minimumOrderCents ?? 0);
  return NextResponse.json({ minimumOrderCents }, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
