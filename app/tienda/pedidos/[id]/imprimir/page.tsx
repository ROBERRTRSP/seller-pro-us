import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { resolveOrderContact } from "@/lib/order-contact-resolved";
import { formatCents } from "@/lib/money";
import { PrintInvoiceFit } from "@/components/PrintInvoiceFit";
import { PrintToolbar } from "@/components/PrintToolbar";
import { productCatalogImageVisible } from "@/lib/product-image";
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
        },
      },
      items: { include: { product: { select: { name: true, imageUrl: true, imagePending: true } } } },
    },
  });
  if (!order) notFound();

  const contact = resolveOrderContact(order, order.user);
  const fecha = formatDateTimeUs(order.createdAt);

  return (
    <PrintInvoiceFit>
      <div className="print-sheet w-full text-[var(--text)] print:text-black">
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <PrintToolbar />
        <Link
          href="/tienda/pedidos"
          className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
        >
          Volver a mis pedidos
        </Link>
      </div>

      <header className="border-b border-[var(--border)] pb-4 print:border-black print:pb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] print:text-[10px] print:text-neutral-600">
          Resumen del pedido
        </p>
        <h1 className="mt-1 text-2xl font-bold print:text-xl print:text-black">Mi pedido</h1>
        <p className="mt-2 font-mono text-sm text-[var(--muted)] print:text-[11px] print:text-neutral-700">
          Ref. {order.id}
        </p>
        <p className="text-sm text-[var(--muted)] print:text-[11px] print:text-neutral-700">{fecha}</p>
        <p className="mt-3 text-sm print:mt-1">
          <span className="text-[var(--muted)] print:text-neutral-600">Estado: </span>
          <strong className="print:text-black">{formatOrderStatus(order.status)}</strong>
        </p>
      </header>

      <section className="mt-6 print:mt-3 print:text-black">
        <h2 className="text-sm font-semibold uppercase text-[var(--muted)] print:text-[11px] print:text-neutral-600">
          Datos del establecimiento
        </h2>
        <p className="mt-1 font-medium print:text-[12px] print:text-black">{contact.name}</p>
        <p className="text-sm text-[var(--muted)] print:text-[11px] print:text-neutral-800">{contact.email}</p>
        <dl className="mt-3 space-y-1.5 text-sm print:mt-1.5 print:space-y-1 print:text-[11px]">
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            <dt className="text-[var(--muted)] print:text-neutral-600">Teléfono</dt>
            <dd className="print:text-black">{contact.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)] print:text-neutral-600">Dirección de entrega</dt>
            <dd className="mt-0.5 whitespace-pre-wrap print:text-black">{contact.address ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 print:mt-4 print:text-black">
        <h2 className="text-sm font-semibold uppercase text-[var(--muted)] print:text-[11px] print:text-neutral-600">
          Artículos
        </h2>
        <table className="print-table mt-3 w-full border-collapse text-sm print:mt-2">
          <thead>
            <tr className="border-b border-[var(--border)] print:border-black">
              <th className="py-2 text-left font-medium print:py-1">Producto</th>
              <th className="w-14 py-2 text-right font-medium print:w-12 print:py-1">Uds.</th>
              <th className="w-24 py-2 text-right font-medium print:w-20 print:py-1">Unidad</th>
              <th className="w-24 py-2 text-right font-medium print:w-20 print:py-1">Línea</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => {
              const line = it.priceCents * it.quantity;
              const showImg = productCatalogImageVisible(it.product.imagePending, it.product.imageUrl);
              return (
                <tr key={it.id} className="border-b border-[var(--border)]/60 print:border-neutral-300">
                  <td className="py-2 align-middle print:py-0.5">
                    <div className="flex items-center gap-1.5 print:gap-1">
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-neutral-600/40 bg-zinc-900/30 print:h-6 print:w-6 print:border-neutral-400">
                        {showImg ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={it.product.imageUrl!}
                            alt=""
                            className="h-full w-full object-contain p-px"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center px-0.5 text-center text-[8px] leading-tight text-zinc-500 print:text-neutral-600">
                            Pend.
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 leading-tight print:text-[8pt]">{it.product.name}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums print:py-0.5">{it.quantity}</td>
                  <td className="py-2 text-right tabular-nums text-[var(--muted)] print:py-0.5 print:text-neutral-700">
                    {formatCents(it.priceCents)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium print:py-0.5">{formatCents(line)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-6 flex flex-col items-end gap-1 border-t border-[var(--border)] pt-3 print:mt-3 print:border-black print:pt-2">
          <span className="text-lg font-bold print:text-base print:text-black">
            Total: {formatCents(order.totalCents)}
          </span>
          <span className="text-xs font-normal text-[var(--muted)] print:text-[10px] print:text-neutral-700">
            Pago al recibir. Sin cargo online ni crédito.
          </span>
        </p>
      </section>

      <p className="no-print mt-10 text-center text-xs text-[var(--muted)]">
        Puedes imprimir o guardar como PDF desde el menú del navegador.
      </p>
    </div>
    </PrintInvoiceFit>
  );
}
