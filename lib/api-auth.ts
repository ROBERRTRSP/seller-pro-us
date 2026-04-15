import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession, getSessionFromCookie } from "@/lib/auth";

export async function requireRole(role: Role) {
  const session =
    role === Role.ADMIN ? await getSessionFromCookie() : await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.role !== role) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}
