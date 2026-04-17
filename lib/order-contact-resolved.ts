/** Prefer snapshot en el pedido; si falta (pedidos antiguos), usar perfil actual del usuario. */

export type ResolvedOrderContact = {
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  businessLicense: string | null;
  tobaccoLicense: string | null;
};

export function resolveOrderContact(
  order: {
    deliveryPhone?: string | null;
    deliveryAddress?: string | null;
    deliveryBusinessLicense?: string | null;
    deliveryTobaccoLicense?: string | null;
  },
  user: {
    name: string;
    email: string;
    phone?: string | null;
    address?: string | null;
    businessLicense?: string | null;
    tobaccoLicense?: string | null;
  },
): ResolvedOrderContact {
  return {
    name: user.name,
    email: user.email,
    phone: order.deliveryPhone ?? user.phone ?? null,
    address: order.deliveryAddress ?? user.address ?? null,
    businessLicense: order.deliveryBusinessLicense ?? user.businessLicense ?? null,
    tobaccoLicense: order.deliveryTobaccoLicense ?? user.tobaccoLicense ?? null,
  };
}
