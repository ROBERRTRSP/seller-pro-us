import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import {
  isTechnicallyDirectProductImageUrl,
  resolveProductImageForAdminPatch,
  type AdminPatchImageResolution,
} from "@/lib/product-image";
import { MAX_PROMO_BADGE_LEN } from "@/lib/product-field-limits";
import { UNLIMITED_STOCK } from "@/lib/product-stock";

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
    sku: string | null;
    barcode: string | null;
    priceCents: number;
    compareAtPriceCents: number | null;
    promoBadge: string | null;
    categoryId: string | null;
    stock?: number;
    inStock?: boolean;
    unlimitedStock?: boolean;
    imageUrl?: string | null;
    imageVerified?: boolean;
    brand?: string | null;
    size?: string | null;
    packSize?: string | null;
    sourceUrl?: string | null;
    sourceImageUrl?: string | null;
    imageStatus?: string | null;
    ageRestricted?: boolean;
    minimumAge?: number | null;
    catalogPublished?: boolean;
  }>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.description !== undefined) data.description = String(body.description).trim();
  if (body.sku !== undefined) {
    data.sku = body.sku === null || body.sku === "" ? null : String(body.sku).trim();
  }
  if (body.barcode !== undefined) {
    data.barcode = body.barcode === null || body.barcode === "" ? null : String(body.barcode).trim();
  }
  if (body.priceCents !== undefined) data.priceCents = Math.max(0, Math.floor(Number(body.priceCents) || 0));
  if (body.unlimitedStock === true) {
    data.stock = UNLIMITED_STOCK;
  } else if (body.stock !== undefined) {
    const raw = Math.floor(Number(body.stock) || 0);
    data.stock = raw === UNLIMITED_STOCK ? UNLIMITED_STOCK : Math.max(0, raw);
  } else if (body.inStock !== undefined) {
    if (existing.stock === UNLIMITED_STOCK) {
      data.stock = body.inStock ? UNLIMITED_STOCK : 0;
    } else {
      data.stock = Boolean(body.inStock) ? Math.max(1, existing.stock) : 0;
    }
  }
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

  if (body.brand !== undefined) {
    data.brand = body.brand === null || String(body.brand).trim() === "" ? null : String(body.brand).trim();
  }
  if (body.size !== undefined) {
    data.size = body.size === null || String(body.size).trim() === "" ? null : String(body.size).trim();
  }
  if (body.packSize !== undefined) {
    data.packSize =
      body.packSize === null || String(body.packSize).trim() === "" ? null : String(body.packSize).trim();
  }
  if (body.sourceUrl !== undefined) {
    data.sourceUrl =
      body.sourceUrl === null || String(body.sourceUrl).trim() === ""
        ? null
        : String(body.sourceUrl).trim();
  }
  if (body.sourceImageUrl !== undefined) {
    data.sourceImageUrl =
      body.sourceImageUrl === null || String(body.sourceImageUrl).trim() === ""
        ? null
        : String(body.sourceImageUrl).trim();
  }
  if (body.imageStatus !== undefined) {
    data.imageStatus =
      body.imageStatus === null || String(body.imageStatus).trim() === ""
        ? null
        : String(body.imageStatus).trim();
  }
  if (body.ageRestricted !== undefined) data.ageRestricted = Boolean(body.ageRestricted);
  if (body.minimumAge !== undefined) {
    if (body.minimumAge === null) data.minimumAge = null;
    else {
      const m = Math.floor(Number(body.minimumAge));
      data.minimumAge = Number.isFinite(m) && m > 0 ? m : null;
    }
  }
  if (body.catalogPublished !== undefined) data.catalogPublished = Boolean(body.catalogPublished);

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

  const imgRes: AdminPatchImageResolution = resolveProductImageForAdminPatch(existing, {
    imageUrl: body.imageUrl,
    imageVerified: body.imageVerified,
  });
  if (imgRes.ok === false) {
    return NextResponse.json({ error: imgRes.error }, { status: 400 });
  }
  if (imgRes.ok !== "unchanged") {
    data.imageUrl = imgRes.imageUrl;
    data.imagePending = imgRes.imagePending;
  }

  const mergedPending = imgRes.ok === "unchanged" ? existing.imagePending : imgRes.imagePending;
  const mergedUrl = imgRes.ok === "unchanged" ? existing.imageUrl : imgRes.imageUrl;
  if (!mergedPending && (!mergedUrl || !isTechnicallyDirectProductImageUrl(mergedUrl))) {
    return NextResponse.json(
      { error: "Sin foto verificada el producto debe quedar con imagen pendiente." },
      { status: 400 },
    );
  }

  if (body.catalogPublished === true) {
    if (mergedPrice <= 0) {
      return NextResponse.json(
        { error: "Indica un precio mayor que 0 antes de publicar el producto en la tienda." },
        { status: 400 },
      );
    }
    if (mergedPending || !mergedUrl || !isTechnicallyDirectProductImageUrl(mergedUrl)) {
      return NextResponse.json(
        { error: "No se puede publicar en la tienda sin imagen aprobada y URL verificada." },
        { status: 400 },
      );
    }
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
