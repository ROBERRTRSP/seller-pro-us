import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { getSessionFromCookie } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: {
    name?: string;
    role?: string;
    email?: string;
    password?: string;
    phone?: string;
    businessLicense?: string;
    tobaccoLicense?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: {
    name?: string;
    role?: Role;
    email?: string;
    password?: string;
    phone?: string | null;
    businessLicense?: string | null;
    tobaccoLicense?: string | null;
  } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    data.name = name;
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Email cannot be empty" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
    if (email !== existing.email) {
      const taken = await prisma.user.findFirst({
        where: { email, NOT: { id } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
      }
      data.email = email;
    }
  }

  if (body.password !== undefined) {
    const password = String(body.password);
    if (password.length > 0) {
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      data.password = await bcrypt.hash(password, 10);
    }
  }

  if (body.phone !== undefined) {
    data.phone = String(body.phone).trim() || null;
  }
  if (body.businessLicense !== undefined) {
    data.businessLicense = String(body.businessLicense).trim() || null;
  }
  if (body.tobaccoLicense !== undefined) {
    data.tobaccoLicense = String(body.tobaccoLicense).trim() || null;
  }

  if (body.role !== undefined) {
    const r = String(body.role).toUpperCase();
    const newRole = r === "ADMIN" ? Role.ADMIN : Role.CLIENT;
    if (newRole === Role.CLIENT && existing.role === Role.ADMIN) {
      const admins = await prisma.user.count({ where: { role: Role.ADMIN } });
      if (admins <= 1) {
        return NextResponse.json(
          { error: "At least one admin must remain" },
          { status: 400 },
        );
      }
    }
    if (newRole === Role.CLIENT && id === session.sub && existing.role === Role.ADMIN) {
      const admins = await prisma.user.count({ where: { role: Role.ADMIN } });
      if (admins <= 1) {
        return NextResponse.json(
          { error: "You cannot leave the system without admins" },
          { status: 400 },
        );
      }
    }
    data.role = newRole;
  }

  const resultingRole = data.role ?? existing.role;
  const resultingPhone = data.phone ?? existing.phone;
  const resultingBusinessLicense = data.businessLicense ?? existing.businessLicense;
  const resultingTobaccoLicense = data.tobaccoLicense ?? existing.tobaccoLicense;
  const shouldValidateClientDocs =
    (body.role !== undefined && resultingRole === Role.CLIENT) ||
    body.phone !== undefined ||
    body.businessLicense !== undefined ||
    body.tobaccoLicense !== undefined;
  if (
    shouldValidateClientDocs &&
    resultingRole === Role.CLIENT &&
    (!resultingPhone || !resultingBusinessLicense || !resultingTobaccoLicense)
  ) {
    return NextResponse.json(
      { error: "Client accounts require phone, Business License, and Tobacco License." },
      { status: 400 },
    );
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      businessLicense: true,
      tobaccoLicense: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  });
  return NextResponse.json(user);
}
