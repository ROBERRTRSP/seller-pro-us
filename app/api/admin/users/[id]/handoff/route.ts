import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { createShopMagicToken } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Issue storefront magic URL + account summary for a user row (admin only).
 * Shoppers get a 15-minute sign-in QR URL; admins get report only.
 */
export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { orders: true } },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          status: true,
          totalCents: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const origin = new URL(req.url).origin;
  let shopMagicUrl: string | null = null;
  let shopMagicExpiresAt: string | null = null;

  if (user.role === Role.CLIENT) {
    try {
      const magic = await createShopMagicToken(user.id);
      shopMagicUrl = `${origin}/api/auth/shop-magic?t=${encodeURIComponent(magic)}`;
      shopMagicExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    } catch (e) {
      console.error("[admin/users/handoff] createShopMagicToken", e);
      return NextResponse.json(
        { error: "Could not create sign-in link. Check AUTH_SECRET on the server." },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
    orderCount: user._count.orders,
    recentOrders: user.orders.map((o) => ({
      id: o.id,
      status: o.status,
      totalCents: o.totalCents,
      createdAt: o.createdAt.toISOString(),
      lineCount: o._count.items,
    })),
    shopMagicUrl,
    shopMagicExpiresAt,
  });
}
