import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { hasValidProductImage } from "@/lib/product-image";
import { MAX_PROMO_BADGE_LEN } from "@/lib/product-field-limits";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await ctx.params;

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Partial<{
    name: string;
    description: string;
    priceCents: number;
    compareAtPriceCents: number | null;
    promoBadge: string | null;
    categoryId: string | null;
    stock?: number;
    inStock?: boolean;
    imageUrl: string | null;
  }>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.description !== undefined) data.description = String(body.description).trim();
  if (body.priceCents !== undefined) data.priceCents = Math.max(0, Math.floor(Number(body.priceCents) || 0));
  if (body.stock !== undefined) {
    data.stock = Math.max(0, Math.floor(Number(body.stock) || 0));
  } else if (body.inStock !== undefined) {
    data.stock = Boolean(body.inStock) ? Math.max(1, existing.stock) : 0;
  }
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null;
  if (body.compareAtPriceCents !== undefined) {
    data.compareAtPriceCents =
      body.compareAtPriceCents === null
        ? null
        : Math.max(0, Math.floor(Number(body.compareAtPriceCents) || 0));
  }
  if (body.promoBadge !== undefined) {
    data.promoBadge =
      body.promoBadge === null || body.promoBadge === ""
        ? null
        : String(body.promoBadge).trim().slice(0, MAX_PROMO_BADGE_LEN);
  }
  if (body.categoryId !== undefined) {
    if (body.categoryId === null || body.categoryId === "") {
      data.categoryId = null;
    } else {
      const cid = String(body.categoryId).trim();
      const cat = await prisma.category.findUnique({ where: { id: cid }, select: { id: true } });
      if (!cat) {
        return NextResponse.json({ error: "Category not found" }, { status: 400 });
      }
      data.categoryId = cat.id;
    }
  }

  const mergedPrice =
    body.priceCents !== undefined ? (data.priceCents as number) : existing.priceCents;
  const mergedCompare =
    body.compareAtPriceCents !== undefined
      ? (data.compareAtPriceCents as number | null)
      : existing.compareAtPriceCents;
  if (mergedCompare != null && mergedCompare <= mergedPrice) {
    return NextResponse.json(
      { error: "The “Was” price must be higher than the current price." },
      { status: 400 },
    );
  }

  const mergedImage =
    body.imageUrl !== undefined ? (data.imageUrl as string | null) : existing.imageUrl;
  if (!hasValidProductImage(mergedImage)) {
    return NextResponse.json(
      {
        error:
          "Each product needs a photo to appear in the catalog. Add an image or URL.",
      },
      { status: 400 },
    );
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Send at least one field to update" }, { status: 400 });
  }

  try {
    const p = await prisma.product.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true, sortOrder: true } } },
    });
    return NextResponse.json(p);
  } catch {
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await ctx.params;
  try {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
