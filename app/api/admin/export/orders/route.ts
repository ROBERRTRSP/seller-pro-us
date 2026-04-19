import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { resolveOrderContact } from "@/lib/order-contact-resolved";
import { parseOrderCreatedRangeQuery } from "@/lib/order-created-range";

function csvEscape(s: string) {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const createdRange = parseOrderCreatedRangeQuery(
    searchParams.get("from"),
    searchParams.get("to"),
  );

  const orders = await prisma.order.findMany({
    where: createdRange ? { createdAt: createdRange } : {},
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          email: true,
          name: true,
          phone: true,
          address: true,
        },
      },
      items: { include: { product: { select: { name: true } } } },
    },
  });

  const headers = [
    "id",
    "created_at",
    "customer_email",
    "customer_name",
    "customer_phone",
    "delivery_address",
    "status",
    "total_usd",
    "lines",
    "admin_note",
  ];
  const lines = [headers.join(",")];

  for (const o of orders) {
    const lineas = o.items
      .map((it) => `${it.product.name}×${it.quantity}`)
      .join("; ");
    const c = resolveOrderContact(o, o.user);
    const row = [
      o.id,
      o.createdAt.toISOString(),
      o.user.email,
      o.user.name,
      c.phone ?? "",
      c.address ?? "",
      o.status,
      (o.totalCents / 100).toFixed(2),
      lineas,
      o.adminNote ?? "",
    ].map((c) => csvEscape(String(c)));
    lines.push(row.join(","));
  }

  const csv = lines.join("\n");
  const res = new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="orders.csv"',
    },
  });
  return res;
}
