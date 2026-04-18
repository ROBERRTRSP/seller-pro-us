import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { resolveProductImageForAdminCreate } from "@/lib/product-image";
import { MAX_PROMO_BADGE_LEN } from "@/lib/product-field-limits";
import { UNLIMITED_STOCK } from "@/lib/product-stock";

function parseStock(body: { stock?: unknown; inStock?: unknown; unlimitedStock?: unknown }): number {
  if (body.unlimitedStock === true) return UNLIMITED_STOCK;
  if (body.stock !== undefined && body.stock !== null) {
    const raw = Math.floor(Number(body.stock) || 0);
    return raw === UNLIMITED_STOCK ? UNLIMITED_STOCK : Math.max(0, raw);
  }
  if (typeof body.inStock === "boolean") return body.inStock ? 99 : 0;
  if (typeof body.inStock === "number") return body.inStock !== 0 ? 99 : 0;
  return 99;
}

export async function GET() {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const products = await prisma.product.findMany({
    orderBy: [{ salesCount: "desc" }, { name: "asc" }],
    include: { category: { select: { id: true, name: true, sortOrder: true } } },
  });
  return NextResponse.json(products, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}

export async function POST(req: Request) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  let body: {
    name?: string;
    description?: string;
    sku?: string | null;
    barcode?: string | null;
    priceCents?: number;
    /** Precio de compra (centavos). Opcional al crear. */
    costCents?: number | null;
    compareAtPriceCents?: number | null;
    promoBadge?: string | null;
    categoryId?: string | null;
    /** Units available; legacy `inStock` boolean still accepted. */
    stock?: number;
    inStock?: boolean;
    unlimitedStock?: boolean;
    imageUrl?: string | null;
    /** Obligatorio para URLs externas (no subida): confirma marca, tipo y presentación. */
    imageVerified?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const sku = body.sku != null && String(body.sku).trim() !== "" ? String(body.sku).trim() : null;
  const barcode = body.barcode != null && String(body.barcode).trim() !== "" ? String(body.barcode).trim() : null;
  const priceCents = Math.max(0, Math.floor(Number(body.priceCents) || 0));

  let costCents: number | null = null;
  if (body.costCents !== undefined && body.costCents !== null) {
    const c = Math.floor(Number(body.costCents));
    if (!Number.isFinite(c) || c < 0) {
      return NextResponse.json({ error: "El precio de compra no es válido." }, { status: 400 });
    }
    costCents = c;
  }
  const stock = parseStock(body);

  const resolved = resolveProductImageForAdminCreate({
    imageUrl: body.imageUrl,
    imageVerified: body.imageVerified,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const { imageUrl, imagePending } = resolved;
  const compareRaw = body.compareAtPriceCents;
  const compareAtPriceCents =
    compareRaw === null || compareRaw === undefined
      ? null
      : Math.max(0, Math.floor(Number(compareRaw) || 0));
  const promoBadge =
    body.promoBadge === null || body.promoBadge === undefined || body.promoBadge === ""
      ? null
      : String(body.promoBadge).trim().slice(0, MAX_PROMO_BADGE_LEN);

  let categoryId: string | null = null;
  if (body.categoryId !== undefined && body.categoryId !== null && String(body.categoryId).trim() !== "") {
    const cid = String(body.categoryId).trim();
    const cat = await prisma.category.findUnique({ where: { id: cid }, select: { id: true } });
    if (!cat) {
      return NextResponse.json({ error: "Category not found" }, { status: 400 });
    }
    categoryId = cat.id;
  }

  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (compareAtPriceCents != null && compareAtPriceCents <= priceCents) {
    return NextResponse.json(
      { error: "El precio «antes» debe ser mayor que el precio actual." },
      { status: 400 },
    );
  }
  const p = await prisma.product.create({
    data: {
      name,
      description,
      sku,
      barcode,
      priceCents,
      costCents,
      compareAtPriceCents,
      promoBadge,
      categoryId,
      stock,
      imageUrl,
      imagePending,
    },
    include: { category: { select: { id: true, name: true, sortOrder: true } } },
  });
  return NextResponse.json(p);
}
