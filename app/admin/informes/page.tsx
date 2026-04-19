import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  appendOrdersExportQuery,
  parseOrderCreatedRangeQuery,
} from "@/lib/order-created-range";
import { formatCents } from "@/lib/money";
import { formatOrderStatus } from "@/lib/us-locale";

type Props = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

function validDateInput(s: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : "";
}

export default async function AdminInformesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const fromRaw = typeof sp.from === "string" ? sp.from : "";
  const toRaw = typeof sp.to === "string" ? sp.to : "";
  const fromDisplay = validDateInput(fromRaw);
  const toDisplay = validDateInput(toRaw);

  const createdRange = parseOrderCreatedRangeQuery(
    fromDisplay || undefined,
    toDisplay || undefined,
  );
  const orderDateFilter = createdRange ? { createdAt: createdRange } : {};

  const [byStatus, topProducts, cancelledSum] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: orderDateFilter,
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: createdRange ? { order: { createdAt: createdRange } } : {},
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 8,
    }),
    prisma.order.aggregate({
      where: {
        status: "CANCELADO",
        ...(createdRange ? { createdAt: createdRange } : {}),
      },
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

  const csvHref = `/api/admin/export/orders${appendOrdersExportQuery(fromDisplay || undefined, toDisplay || undefined)}`;
  const periodNote =
    fromDisplay || toDisplay
      ? ` (${[fromDisplay ? `desde ${fromDisplay}` : "", toDisplay ? `hasta ${toDisplay}` : ""]
          .filter(Boolean)
          .join(" · ")})`
      : "";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Informes</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Resumen por estado, productos más vendidos y exportación de datos.
        {periodNote ? (
          <span className="mt-1 block text-amber-200/90">Período:{periodNote}</span>
        ) : (
          <span className="mt-1 block text-[var(--muted)]">Sin filtro de fechas: todo el histórico.</span>
        )}
      </p>

      <form
        method="get"
        action="/admin/informes"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <div>
          <label htmlFor="informes-from" className="block text-xs font-medium text-[var(--muted)]">
            Desde
          </label>
          <input
            id="informes-from"
            name="from"
            type="date"
            defaultValue={fromDisplay}
            className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </div>
        <div>
          <label htmlFor="informes-to" className="block text-xs font-medium text-[var(--muted)]">
            Hasta
          </label>
          <input
            id="informes-to"
            name="to"
            type="date"
            defaultValue={toDisplay}
            className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
        >
          Aplicar
        </button>
        {(fromDisplay || toDisplay) && (
          <Link
            href="/admin/informes"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]"
          >
            Limpiar fechas
          </Link>
        )}
        <p className="w-full text-xs text-[var(--muted)]">
          Los totales usan la fecha de creación del pedido (intervalo en UTC según el día elegido).
        </p>
      </form>

      <div className="mt-8 flex flex-wrap gap-4">
        <a
          href={csvHref}
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
            {byStatus.length === 0 ? (
              <li className="text-sm text-[var(--muted)]">No hay pedidos en este período.</li>
            ) : (
              byStatus.map((s) => (
                <li key={s.status} className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">{formatOrderStatus(s.status)}</span>
                  <span>
                    {s._count._all} pedidos · {formatCents(s._sum.totalCents ?? 0)}
                  </span>
                </li>
              ))
            )}
          </ul>
          <p className="mt-4 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            Cancelados en período: {cancelledSum._count._all} · total cancelado{" "}
            {formatCents(cancelledSum._sum.totalCents ?? 0)}
          </p>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Unidades vendidas (top)
          </h2>
          {topProducts.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              No hay líneas de pedido en este período.
            </p>
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
