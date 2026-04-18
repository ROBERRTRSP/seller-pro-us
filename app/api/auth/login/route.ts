import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { clearLoginFailures, isLoginBlocked, loginRateLimitKey, recordLoginFailure } from "@/lib/login-rate-limit";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida." }, { status: 400 });
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json({ error: "Introduce correo y contraseña." }, { status: 400 });
  }

  const rateKey = loginRateLimitKey(req, email);
  const blocked = isLoginBlocked(rateKey);
  if (blocked.blocked) {
    return NextResponse.json(
      { error: "Demasiados intentos fallidos. Espera e inténtalo de nuevo." },
      {
        status: 429,
        headers: { "Retry-After": String(blocked.retryAfterSec) },
      },
    );
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { email } });
  } catch (e) {
    console.error("[auth/login] prisma", e);
    return NextResponse.json(
      {
        error:
          "No hay conexión a la base de datos. Comprueba DATABASE_URL en .env (debe ser postgresql://… con el esquema actual). En local: docker compose up -d && npx prisma db push && npm run db:seed",
      },
      { status: 503 },
    );
  }
  if (!user) {
    const after = recordLoginFailure(rateKey);
    if (after.blocked) {
      return NextResponse.json(
        { error: "Demasiados intentos fallidos. Espera e inténtalo de nuevo." },
        {
          status: 429,
          headers: { "Retry-After": String(after.retryAfterSec) },
        },
      );
    }
    return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    const after = recordLoginFailure(rateKey);
    if (after.blocked) {
      return NextResponse.json(
        { error: "Demasiados intentos fallidos. Espera e inténtalo de nuevo." },
        {
          status: 429,
          headers: { "Retry-After": String(after.retryAfterSec) },
        },
      );
    }
    return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  }

  clearLoginFailures(rateKey);

  let token: string;
  try {
    token = await createSessionToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (e) {
    console.error("[auth/login]", e);
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("AUTH_SECRET")) {
      return NextResponse.json(
        {
          error:
            "En el servidor falta AUTH_SECRET o es demasiado corta (mín. 16 caracteres). Configúrala en Vercel / .env.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo crear la sesión. Revisa la base de datos y la configuración." },
      { status: 500 },
    );
  }

  const res = NextResponse.json({
    ok: true,
    redirect: user.role === Role.ADMIN ? "/admin" : "/tienda",
  });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}
