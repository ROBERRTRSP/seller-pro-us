import { NextResponse } from "next/server";
import { IMPERSONATE_COOKIE, SESSION_COOKIE } from "@/lib/constants";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const clear = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
  res.cookies.set(SESSION_COOKIE, "", clear);
  res.cookies.set(IMPERSONATE_COOKIE, "", clear);
  return res;
}
