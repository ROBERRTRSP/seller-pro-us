import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export async function GET() {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          email: true,
          name: true,
          phone: true,
          address: true,
          businessLicense: true,
          tobaccoLicense: true,
        },
      },
      items: {
        include: {
          product: { select: { id: true, name: true, imageUrl: true, imagePending: true } },
        },
      },
    },
  });
  return NextResponse.json(orders, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  });
}
