import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export async function GET() {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
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
  return NextResponse.json(users, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}

export async function POST(req: Request) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  let body: {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
    phone?: string;
    businessLicense?: string;
    tobaccoLicense?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  const roleRaw = String(body.role ?? "CLIENT").toUpperCase();
  const role = roleRaw === "ADMIN" ? Role.ADMIN : Role.CLIENT;
  const phone = String(body.phone ?? "").trim();
  const businessLicense = String(body.businessLicense ?? "").trim();
  const tobaccoLicense = String(body.tobaccoLicense ?? "").trim();

  if (!email || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Email required and password at least 6 characters" },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (role === Role.CLIENT) {
    if (!phone || !businessLicense || !tobaccoLicense) {
      return NextResponse.json(
        { error: "For client accounts, phone, Business License, and Tobacco License are required." },
        { status: 400 },
      );
    }
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        email,
        password: hash,
        name,
        role,
        phone: role === Role.CLIENT ? phone : null,
        businessLicense: role === Role.CLIENT ? businessLicense : null,
        tobaccoLicense: role === Role.CLIENT ? tobaccoLicense : null,
      },
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
  } catch {
    return NextResponse.json({ error: "That email is already registered" }, { status: 409 });
  }
}
