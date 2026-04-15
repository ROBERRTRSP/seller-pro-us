import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Borra pedidos, productos, categorías y usuarios (tienda “vacía”).
 * Opcional: crea un solo admin si defines BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD.
 */
async function main() {
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = (process.env.BOOTSTRAP_ADMIN_NAME ?? "Admin").trim() || "Admin";

  if (email && password && password.length >= 6) {
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email, password: hash, name, role: Role.ADMIN },
    });
    console.log(`Listo: tienda vacía y admin inicial → ${email}`);
  } else {
    console.log("Listo: tienda vacía (sin usuarios).");
    console.log(
      "Para poder entrar al panel: vuelve a ejecutar con BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD (mín. 6 caracteres), o crea un usuario con Prisma Studio / SQL.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
