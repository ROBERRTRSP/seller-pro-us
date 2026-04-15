import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createImpersonateToken, getSessionFromCookie } from "@/lib/auth";
import { IMPERSONATE_COOKIE } from "@/lib/constants";

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

/** Start impersonation: admins only, shopper accounts only. */
export async function POST(req: Request) {
  const admin = await getSessionFromCookie();
  if (!admin || admin.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const userId = String(body.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.role !== Role.CLIENT) {
    return NextResponse.json(
      {
        error:
          "You can only enter the storefront as shoppers. Other admins use the admin panel.",
      },
      { status: 400 },
    );
  }

  let token: string;
  try {
    token = await createImpersonateToken(admin.sub, target.id);
  } catch (e) {
    console.error("[admin/impersonate]", e);
    return NextResponse.json(
      { error: "Could not start shopper view (AUTH_SECRET or session)." },
      { status: 503 },
    );
  }
  const res = NextResponse.json({ ok: true, redirect: "/tienda" });
  res.cookies.set(IMPERSONATE_COOKIE, token, cookieOpts(60 * 60 * 8));
  return res;
}

/** End impersonation (restore normal admin session on the storefront). */
export async function DELETE() {
  const admin = await getSessionFromCookie();
  if (!admin || admin.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(IMPERSONATE_COOKIE, "", { ...cookieOpts(0), maxAge: 0 });
  return res;
}
