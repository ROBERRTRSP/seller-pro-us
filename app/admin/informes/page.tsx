import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatOrderStatus } from "@/lib/us-locale";

export default async function AdminInformesPage() {
  const [byStatus, topProducts, cancelledSum] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 8,
    }),
    prisma.order.aggregate({
      where: { status: "CANCELADO" },
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
  ]);

  const productIds = topProducts.map((t) => t.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Informes</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Resumen por estado, productos más vendidos y exportación de datos.
      </p>

      <div className="mt-8 flex flex-wrap gap-4">
        <a
          href="/api/admin/export/orders"
          className="inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          Descargar pedidos (CSV)
        </a>
        <Link
          href="/admin"
          className="inline-flex items-center rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
        >
          ← Volver al panel
        </Link>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Pedidos por estado
          </h2>
          <ul className="mt-4 space-y-3">
            {byStatus.map((s) => (
              <li key={s.status} className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">{formatOrderStatus(s.status)}</span>
                <span>
                  {s._count._all} pedidos · {formatCents(s._sum.totalCents ?? 0)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            Cancelados: {cancelledSum._count._all} · total cancelado{" "}
            {formatCents(cancelledSum._sum.totalCents ?? 0)}
          </p>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Unidades vendidas (top)
          </h2>
          {topProducts.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Aún no hay datos de ventas.</p>
          ) : (
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
              {topProducts.map((t) => (
                <li key={t.productId} className="flex justify-between gap-2">
                  <span>{nameById.get(t.productId) ?? t.productId}</span>
                  <span className="text-[var(--muted)]">{t._sum.quantity ?? 0} uds.</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
