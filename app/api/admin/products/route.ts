import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { hasValidProductImage } from "@/lib/product-image";
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
    orderBy: { createdAt: "desc" },
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
    priceCents?: number;
    compareAtPriceCents?: number | null;
    promoBadge?: string | null;
    categoryId?: string | null;
    /** Units available; legacy `inStock` boolean still accepted. */
    stock?: number;
    inStock?: boolean;
    unlimitedStock?: boolean;
    imageUrl?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const priceCents = Math.max(0, Math.floor(Number(body.priceCents) || 0));
  const stock = parseStock(body);
  const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null;
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
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (compareAtPriceCents != null && compareAtPriceCents <= priceCents) {
    return NextResponse.json(
      { error: "The “Was” price must be higher than the current price (to show a deal)." },
      { status: 400 },
    );
  }
  if (!hasValidProductImage(imageUrl)) {
    return NextResponse.json(
      {
        error: "A photo is required: upload an image or provide a URL to publish in the catalog.",
      },
      { status: 400 },
    );
  }

  const p = await prisma.product.create({
    data: {
      name,
      description,
      priceCents,
      compareAtPriceCents,
      promoBadge,
      categoryId,
      stock,
      imageUrl,
    },
    include: { category: { select: { id: true, name: true, sortOrder: true } } },
  });
  return NextResponse.json(p);
}
