import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { rawRowToForm } from "@/lib/site-settings-defaults";

const SETTINGS_ID = "default";

const LIMITS: Record<string, number> = {
  siteTitle: 120,
  siteDescription: 500,
  storeName: 80,
  storefrontNotice: 500,
  navBrowse: 40,
  navCart: 40,
  navOrders: 40,
  heroEyebrow: 120,
  heroTitle: 200,
  heroSubtitle: 200,
  heroBody: 2000,
  heroCtaLabel: 60,
};

function slice(key: keyof typeof LIMITS, v: string): string {
  return v.slice(0, LIMITS[key] ?? 500);
}

export async function GET() {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const row = await prisma.siteSettings.findUnique({ where: { id: SETTINGS_ID } });
  const form = rawRowToForm(row);
  return NextResponse.json({
    ...form,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  });
}

export async function PATCH(req: Request) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const keys = [
    "siteTitle",
    "siteDescription",
    "storeName",
    "storefrontNotice",
    "navBrowse",
    "navCart",
    "navOrders",
    "heroEyebrow",
    "heroTitle",
    "heroSubtitle",
    "heroBody",
    "heroCtaLabel",
  ] as const;

  const data = {} as Record<(typeof keys)[number], string>;
  for (const k of keys) {
    data[k] = slice(k, String(body[k] ?? ""));
  }

  await prisma.siteSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      ...data,
    },
    update: data,
  });

  const row = await prisma.siteSettings.findUnique({ where: { id: SETTINGS_ID } });
  const form = rawRowToForm(row);
  return NextResponse.json({
    ...form,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  });
}
