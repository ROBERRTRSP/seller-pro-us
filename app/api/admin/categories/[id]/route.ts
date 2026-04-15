import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { MAX_CATEGORY_LEN } from "@/lib/product-field-limits";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await ctx.params;
  let body: { name?: string; sortOrder?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: { name?: string; sortOrder?: number } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, MAX_CATEGORY_LEN);
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    if (name !== existing.name) {
      const taken = await prisma.category.findFirst({
        where: { name, NOT: { id } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json({ error: "That name is already in use" }, { status: 409 });
      }
    }
    data.name = name;
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = Math.floor(Number(body.sortOrder));
    if (!Number.isFinite(sortOrder)) {
      return NextResponse.json({ error: "Invalid sort order" }, { status: 400 });
    }
    data.sortOrder = sortOrder;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  try {
    const c = await prisma.category.update({
      where: { id },
      data,
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json(c);
  } catch {
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await ctx.params;
  try {
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
