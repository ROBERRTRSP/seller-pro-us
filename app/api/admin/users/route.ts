import { NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
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
      address: true,
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
    address?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos en la petición." }, { status: 400 });
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
  const address = String(body.address ?? "").trim();

  if (!email || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Correo obligatorio y contraseña de al menos 6 caracteres." },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (role === Role.CLIENT) {
    if (!phone || !address || !businessLicense || !tobaccoLicense) {
      return NextResponse.json(
        {
          error:
            "Para cuenta de cliente: teléfono, dirección, Business License y Tobacco License son obligatorios.",
        },
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
        address: role === Role.CLIENT ? address : null,
        businessLicense: role === Role.CLIENT ? businessLicense : null,
        tobaccoLicense: role === Role.CLIENT ? tobaccoLicense : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        address: true,
        businessLicense: true,
        tobaccoLicense: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    });
    return NextResponse.json(user);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return NextResponse.json(
          {
            error:
              "Ese correo ya está registrado. Usa otro correo o busca el usuario en la tabla y edítalo.",
          },
          { status: 409 },
        );
      }
      if (e.code === "P2021" || e.code === "P2022") {
        return NextResponse.json(
          {
            error:
              "La base de datos no está al día con el código (falta tabla o columna). Ejecuta en la carpeta del proyecto: npx prisma migrate deploy — luego reinicia el servidor de desarrollo.",
          },
          { status: 503 },
        );
      }
    }
    if (e instanceof Prisma.PrismaClientInitializationError) {
      console.error("[admin/users POST] db init", e);
      return NextResponse.json(
        {
          error:
            "No se pudo conectar a la base de datos. Revisa DATABASE_URL en .env y que PostgreSQL esté en marcha (por ejemplo docker compose up).",
        },
        { status: 503 },
      );
    }
    if (e instanceof Prisma.PrismaClientValidationError) {
      console.error("[admin/users POST] validation", e.message);
      return NextResponse.json(
        {
          error:
            "Los datos no encajan con el esquema de la base de datos. Ejecuta npx prisma migrate deploy y npx prisma generate, y reinicia.",
        },
        { status: 400 },
      );
    }
    console.error("[admin/users POST]", e);
    const devHint =
      process.env.NODE_ENV !== "production" && e instanceof Error && e.message
        ? ` Detalle técnico: ${e.message.slice(0, 280)}`
        : "";
    return NextResponse.json(
      {
        error: `No se pudo crear el usuario. Revisa los datos o inténtalo más tarde.${devHint}`,
      },
      { status: 500 },
    );
  }
}
