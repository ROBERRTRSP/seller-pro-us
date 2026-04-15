import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { PrintToolbar } from "@/components/PrintToolbar";
import { formatDateTimeUs, formatOrderStatus } from "@/lib/us-locale";

type Props = { params: Promise<{ id: string }> };

export default async function AdminImprimirPedidoPage({ params }: Props) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      items: { include: { product: { select: { name: true } } } },
    },
  });
  if (!order) notFound();

  const fecha = formatDateTimeUs(order.createdAt);

  return (
    <div className="print-sheet mx-auto max-w-2xl text-[var(--text)] print:max-w-none print:text-black">
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <PrintToolbar />
        <Link
          href="/admin/pedidos"
          className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
        >
          Volver a pedidos
        </Link>
      </div>

      <header className="border-b border-[var(--border)] pb-4 print:border-black">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] print:text-neutral-600">
          Hoja de almacén / envío
        </p>
        <h1 className="mt-1 text-2xl font-bold print:text-black">Pedido</h1>
        <p className="mt-2 font-mono text-sm text-[var(--muted)] print:text-neutral-700">Ref. {order.id}</p>
        <p className="text-sm text-[var(--muted)] print:text-neutral-700">{fecha}</p>
        <p className="mt-3 text-sm">
          <span className="text-[var(--muted)] print:text-neutral-600">Estado: </span>
          <strong className="print:text-black">{formatOrderStatus(order.status)}</strong>
        </p>
      </header>

      <section className="mt-6 print:text-black">
        <h2 className="text-sm font-semibold uppercase text-[var(--muted)] print:text-neutral-600">Cliente</h2>
        <p className="mt-1 font-medium print:text-black">{order.user.name}</p>
        <p className="text-sm text-[var(--muted)] print:text-neutral-800">{order.user.email}</p>
      </section>

      <section className="mt-8 print:text-black">
        <h2 className="text-sm font-semibold uppercase text-[var(--muted)] print:text-neutral-600">Líneas</h2>
        <table className="print-table mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] print:border-black">
              <th className="py-2 text-left font-medium">Producto</th>
              <th className="w-16 py-2 text-right font-medium">Uds.</th>
              <th className="w-28 py-2 text-right font-medium">Unidad</th>
              <th className="w-28 py-2 text-right font-medium">Línea</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => {
              const line = it.priceCents * it.quantity;
              return (
                <tr key={it.id} className="border-b border-[var(--border)]/60 print:border-neutral-300">
                  <td className="py-2.5">{it.product.name}</td>
                  <td className="py-2.5 text-right tabular-nums">{it.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums text-[var(--muted)] print:text-neutral-700">
                    {formatCents(it.priceCents)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-medium">{formatCents(line)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-6 flex justify-end border-t border-[var(--border)] pt-4 text-lg font-bold print:border-black print:text-black">
          Total: {formatCents(order.totalCents)}
        </p>
      </section>

      {order.adminNote ? (
        <section className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 print:border-neutral-400 print:bg-transparent print:text-black">
          <h2 className="text-xs font-semibold uppercase text-amber-200/90 print:text-neutral-600">
            Nota interna
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm print:text-black">{order.adminNote}</p>
        </section>
      ) : null}

      <p className="no-print mt-10 text-center text-xs text-[var(--muted)]">
        Usa el botón de arriba o el menú del navegador (Archivo → Imprimir) para imprimir o guardar como PDF.
      </p>
    </div>
  );
}
