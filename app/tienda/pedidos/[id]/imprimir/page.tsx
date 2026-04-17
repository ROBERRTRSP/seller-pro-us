import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveOrderContact } from "@/lib/order-contact-resolved";
import { formatCents } from "@/lib/money";
import { PrintToolbar } from "@/components/PrintToolbar";
import { formatDateTimeUs, formatOrderStatus } from "@/lib/us-locale";

type Props = { params: Promise<{ id: string }> };

export default async function ClienteImprimirPedidoPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, userId: session.sub },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
          address: true,
          businessLicense: true,
          tobaccoLicense: true,
        },
      },
      items: { include: { product: { select: { name: true } } } },
    },
  });
  if (!order) notFound();

  const contact = resolveOrderContact(order, order.user);
  const fecha = formatDateTimeUs(order.createdAt);

  return (
    <div className="print-sheet mx-auto max-w-2xl text-[var(--text)] print:max-w-none print:text-black">
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <PrintToolbar />
        <Link
          href="/tienda/pedidos"
          className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
        >
          Volver a mis pedidos
        </Link>
      </div>

      <header className="border-b border-[var(--border)] pb-4 print:border-black">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] print:text-neutral-600">
          Resumen del pedido
        </p>
        <h1 className="mt-1 text-2xl font-bold print:text-black">Mi pedido</h1>
        <p className="mt-2 font-mono text-sm text-[var(--muted)] print:text-neutral-700">Ref. {order.id}</p>
        <p className="text-sm text-[var(--muted)] print:text-neutral-700">{fecha}</p>
        <p className="mt-3 text-sm">
          <span className="text-[var(--muted)] print:text-neutral-600">Estado: </span>
          <strong className="print:text-black">{formatOrderStatus(order.status)}</strong>
        </p>
      </header>

      <section className="mt-6 print:text-black">
        <h2 className="text-sm font-semibold uppercase text-[var(--muted)] print:text-neutral-600">
          Datos del establecimiento
        </h2>
        <p className="mt-1 font-medium print:text-black">{contact.name}</p>
        <p className="text-sm text-[var(--muted)] print:text-neutral-800">{contact.email}</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            <dt className="text-[var(--muted)] print:text-neutral-600">Teléfono</dt>
            <dd className="print:text-black">{contact.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)] print:text-neutral-600">Dirección de entrega</dt>
            <dd className="mt-0.5 whitespace-pre-wrap print:text-black">{contact.address ?? "—"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            <dt className="text-[var(--muted)] print:text-neutral-600">Business license</dt>
            <dd className="font-mono text-xs print:text-black">{contact.businessLicense ?? "—"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            <dt className="text-[var(--muted)] print:text-neutral-600">Tobacco license</dt>
            <dd className="font-mono text-xs print:text-black">{contact.tobaccoLicense ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 print:text-black">
        <h2 className="text-sm font-semibold uppercase text-[var(--muted)] print:text-neutral-600">Artículos</h2>
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
        <p className="mt-6 flex flex-col items-end gap-1 border-t border-[var(--border)] pt-4 print:border-black">
          <span className="text-lg font-bold print:text-black">Total: {formatCents(order.totalCents)}</span>
          <span className="text-xs font-normal text-[var(--muted)] print:text-neutral-700">
            Pago al recibir. Sin cargo online ni crédito.
          </span>
        </p>
      </section>

      <p className="no-print mt-10 text-center text-xs text-[var(--muted)]">
        Puedes imprimir o guardar como PDF desde el menú del navegador.
      </p>
    </div>
  );
}
