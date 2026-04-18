/** Fila de usuario en /admin/usuarios (lista y panel de detalle). */
export type AdminUserListRow = {
  id: string;
  email: string;
  name: string;
  role: "CLIENT" | "ADMIN";
  phone: string | null;
  address: string | null;
  businessLicense: string | null;
  tobaccoLicense: string | null;
  createdAt: string;
  _count: { orders: number };
};
