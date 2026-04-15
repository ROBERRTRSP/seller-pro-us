import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSessionToken, verifyShopMagicToken, SESSION_COOKIE } from "@/lib/auth";

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

/**
 * Magic link for shoppers: sets session cookie and redirects to storefront orders.
 * Intended to be opened from a QR code generated in Admin → Users.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  const login = new URL("/login", request.url);

  if (!token?.trim()) {
    login.searchParams.set("magic", "missing");
    return NextResponse.redirect(login);
  }

  const userId = await verifyShopMagicToken(token);
  if (!userId) {
    login.searchParams.set("magic", "expired");
    return NextResponse.redirect(login);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user || user.role !== Role.CLIENT) {
    login.searchParams.set("magic", "invalid");
    return NextResponse.redirect(login);
  }

  let sessionJwt: string;
  try {
    sessionJwt = await createSessionToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch {
    login.searchParams.set("magic", "error");
    return NextResponse.redirect(login);
  }

  const res = NextResponse.redirect(new URL("/tienda/pedidos", request.url));
  res.cookies.set(SESSION_COOKIE, sessionJwt, cookieBase);
  return res;
}
