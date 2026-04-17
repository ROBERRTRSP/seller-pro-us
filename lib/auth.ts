import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { IMPERSONATE_COOKIE, SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/db";

export { SESSION_COOKIE };

export type SessionUser = {
  sub: string;
  email: string;
  name: string;
  role: Role;
  /** Set when an admin is browsing the store as another user */
  impersonator?: { sub: string; email: string; name: string };
};

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET must be at least 16 characters");
  }
  return new TextEncoder().encode(s);
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    sub: user.sub,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sub = String(payload.sub ?? "");
    const email = String(payload.email ?? "");
    const name = String(payload.name ?? "");
    const role = payload.role as Role;
    if (!sub || !email || (role !== Role.ADMIN && role !== Role.CLIENT)) return null;
    return { sub, email, name, role };
  } catch {
    return null;
  }
}

type ImpersonatePayload = { typ: string; admSub: string; clientSub: string };

async function verifyImpersonateToken(token: string): Promise<ImpersonatePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.typ !== "imp") return null;
    const admSub = String(payload.admSub ?? "");
    const clientSub = String(payload.clientSub ?? "");
    if (!admSub || !clientSub) return null;
    return { typ: "imp", admSub, clientSub };
  } catch {
    return null;
  }
}

export async function createImpersonateToken(adminSub: string, clientSub: string) {
  return new SignJWT({
    typ: "imp",
    admSub: adminSub,
    clientSub,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

/** Short-lived token: scanned QR opens storefront signed in as this shopper (CLIENT only). */
export async function createShopMagicToken(userId: string) {
  return new SignJWT({ typ: "shop_magic" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret());
}

export async function verifyShopMagicToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.typ !== "shop_magic") return null;
    const sub = String(payload.sub ?? "");
    return sub || null;
  } catch {
    return null;
  }
}

/** Raw JWT session (no impersonation). Use for admin APIs and admin UI. */
export async function getSessionFromCookie(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Effective identity: if an admin has a valid impersonation cookie for a shopper,
 * returns that shopper with `impersonator` filled in.
 */
export async function getSession(): Promise<SessionUser | null> {
  const real = await getSessionFromCookie();
  if (!real) return null;
  if (real.role !== Role.ADMIN) return real;

  const jar = await cookies();
  const impTok = jar.get(IMPERSONATE_COOKIE)?.value;
  if (!impTok) return real;

  const imp = await verifyImpersonateToken(impTok);
  if (!imp || imp.admSub !== real.sub) return real;

  let client;
  try {
    client = await prisma.user.findUnique({
      where: { id: imp.clientSub },
      select: { id: true, email: true, name: true, role: true },
    });
  } catch {
    return real;
  }
  if (!client || client.role !== Role.CLIENT) return real;

  return {
    sub: client.id,
    email: client.email,
    name: client.name,
    role: Role.CLIENT,
    impersonator: { sub: real.sub, email: real.email, name: real.name },
  };
}

/** When an admin is impersonating, shopper info for banners in the admin panel. */
export async function getImpersonationContext(): Promise<{
  clientName: string;
  clientEmail: string;
} | null> {
  const eff = await getSession();
  const real = await getSessionFromCookie();
  if (!real || real.role !== Role.ADMIN || !eff?.impersonator) return null;
  return { clientName: eff.name, clientEmail: eff.email };
}
