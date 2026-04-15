import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { MAX_CATEGORY_LEN } from "@/lib/product-field-limits";

export async function GET() {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return NextResponse.json(categories, {
    headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
  });
}

export async function POST(req: Request) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  let body: { name?: string; sortOrder?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, MAX_CATEGORY_LEN);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let sortOrder =
    body.sortOrder !== undefined && body.sortOrder !== null
      ? Math.floor(Number(body.sortOrder))
      : NaN;
  if (!Number.isFinite(sortOrder)) {
    const agg = await prisma.category.aggregate({ _max: { sortOrder: true } });
    sortOrder = (agg._max.sortOrder ?? -1) + 1;
  }

  try {
    const c = await prisma.category.create({
      data: { name, sortOrder },
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json(c);
  } catch {
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  }
}
