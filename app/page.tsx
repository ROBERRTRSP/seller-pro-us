import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Role } from "@prisma/client";

/** Usa cookies para sesión; no estático en build. */
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  redirect(session.role === Role.ADMIN ? "/admin" : "/tienda");
}
