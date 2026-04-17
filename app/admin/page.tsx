import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { Role } from "@prisma/client";
import { APP_LOCALE, formatOrderStatus } from "@/lib/us-locale";

export default async function AdminHomePage() {
  try {
    const [
      productCount,
      orderCount,
      pendingOrders,
      revenueAgg,
      unavailableProducts,
      recentOrders,
      userCount,
      clientCount,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.count({ where: { status: "PENDIENTE" } }),
      prisma.order.aggregate({
        where: { status: { not: "CANCELADO" } },
        _sum: { totalCents: true },
      }),
      prisma.product.findMany({
        where: { stock: 0 },
        orderBy: { name: "asc" },
        take: 12,
        select: { id: true, name: true },
      }),
      prisma.order.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.user.count(),
      prisma.user.count({ where: { role: Role.CLIENT } }),
    ]);

    const ingresos = revenueAgg._sum.totalCents ?? 0;

    return (
    <div>
      <h1 className="text-2xl font-semibold">Panel</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Resumen de la tienda, avisos y enlaces rápidos.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--muted)]">Ingresos (sin cancelados)</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-400/90">{formatCents(ingresos)}</p>
          <Link
            href="/admin/informes"
            className="mt-3 inline-block text-sm text-[var(--accent)] hover:underline"
          >
            Informes y exportación →
          </Link>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--muted)]">Productos</p>
          <p className="mt-1 text-3xl font-semibold">{productCount}</p>
          <Link href="/admin/productos" className="mt-3 inline-block text-sm text-[var(--accent)] hover:underline">
            Gestionar →
          </Link>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--muted)]">Pedidos / pendientes</p>
          <p className="mt-1 text-3xl font-semibold">{orderCount}</p>
          <p className="mt-1 text-sm text-amber-300">{pendingOrders} pendientes</p>
          <Link href="/admin/pedidos" className="mt-2 inline-block text-sm text-[var(--accent)] hover:underline">
            Ver pedidos →
          </Link>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--muted)]">Usuarios</p>
          <p className="mt-1 text-3xl font-semibold">{userCount}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{clientCount} clientes</p>
          <Link href="/admin/usuarios" className="mt-2 inline-block text-sm text-[var(--accent)] hover:underline">
            Gestionar usuarios →
          </Link>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Sin existencias (no hay)
            </h2>
            <Link href="/admin/productos" className="text-xs text-[var(--accent)] hover:underline">
              Editar
            </Link>
          </div>
          {unavailableProducts.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Todos los productos están marcados como disponibles.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {unavailableProducts.map((p) => (
                <li key={p.id} className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="text-red-400">No hay</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Pedidos recientes
            </h2>
            <Link href="/admin/pedidos" className="text-xs text-[var(--accent)] hover:underline">
              Ver todos
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Aún no hay pedidos.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {recentOrders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{o.user.name}</p>
                    <p className="text-xs text-[var(--muted)]">{o.user.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCents(o.totalCents)}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {formatOrderStatus(o.status)} ·{" "}
                      {new Date(o.createdAt).toLocaleDateString(APP_LOCALE, { dateStyle: "medium" })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
  } catch (e) {
    console.error("[admin/page] prisma", e);
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-6">
        <h1 className="text-xl font-semibold text-red-100">No se pudo cargar el panel</h1>
        <p className="mt-2 text-sm text-red-100/85">
          No hay conexión con la base de datos o la configuración falló. En local: arranca Postgres (
          <code className="rounded bg-black/30 px-1">docker compose up -d</code>) y revisa{" "}
          <code className="rounded bg-black/30 px-1">DATABASE_URL</code> en{" "}
          <code className="rounded bg-black/30 px-1">.env</code>. En producción (Vercel): misma variable
          apuntando a Neon.
        </p>
      </div>
    );
  }
}
