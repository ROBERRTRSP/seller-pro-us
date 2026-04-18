import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose/jwt/verify";
import { IMPERSONATE_COOKIE, SESSION_COOKIE } from "@/lib/constants";

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

async function hasValidImpersonation(
  request: NextRequest,
  secret: Uint8Array,
  adminSub: string,
): Promise<boolean> {
  const imp = request.cookies.get(IMPERSONATE_COOKIE)?.value;
  if (!imp) return false;
  try {
    const { payload } = await jwtVerify(imp, secret);
    const p = payload as { typ?: string; admSub?: string; clientSub?: string };
    return p.typ === "imp" && p.admSub === adminSub && typeof p.clientSub === "string";
  } catch {
    return false;
  }
}

async function handleMiddleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const secret = getSecret();
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  let role: string | null = null;
  let adminSub: string | null = null;
  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, secret);
      role = typeof payload.role === "string" ? payload.role : null;
      adminSub = typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      role = null;
      adminSub = null;
    }
  }

  if (pathname.startsWith("/login")) {
    if (role === "ADMIN") {
      if (secret && adminSub && (await hasValidImpersonation(request, secret, adminSub))) {
        return NextResponse.redirect(new URL("/tienda", request.url));
      }
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (role === "CLIENT") {
      return NextResponse.redirect(new URL("/tienda", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (role !== "ADMIN") {
      const url = new URL(role ? "/tienda" : "/login", request.url);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/tienda")) {
    const canTienda =
      role === "CLIENT" ||
      (role === "ADMIN" &&
        !!secret &&
        !!adminSub &&
        (await hasValidImpersonation(request, secret, adminSub)));
    if (!canTienda) {
      const url = new URL(role === "ADMIN" ? "/admin" : "/login", request.url);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export async function middleware(request: NextRequest) {
  try {
    return await handleMiddleware(request);
  } catch (e) {
    console.error("[middleware]", e);
    const { pathname } = request.nextUrl;
    if (pathname.startsWith("/login")) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/login", "/admin/:path*", "/tienda/:path*"],
};
