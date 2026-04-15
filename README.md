# Tienda / Seller Pro (Next.js)

Catálogo, carrito, pedidos y panel de administración.

## Requisitos

- Node.js 20+
- Docker (solo para Postgres local) o una URL `DATABASE_URL` de PostgreSQL (p. ej. Neon)

## Puesta en marcha

1. Clona el repo y entra en la carpeta del proyecto.
2. Copia variables de entorno: `cp .env.example .env` y edita `.env` (sobre todo `DATABASE_URL` y `AUTH_SECRET`).
3. Base de datos local con Docker:

   ```bash
   docker compose up -d
   npx prisma migrate deploy
   npm run db:seed
   ```

4. Instala dependencias y arranca en desarrollo:

   ```bash
   npm install
   npm run dev
   ```

Abre la URL que indique la terminal (por defecto [http://localhost:3000](http://localhost:3000)).

## Cuentas demo (tras `db:seed`)

- Cliente: `cliente@tienda.local`
- Admin: `admin@tienda.local`
- Contraseña: `demo1234`

## Scripts útiles

| Comando | Uso |
|--------|-----|
| `npm run dev` | Desarrollo (Turbopack) |
| `npm run dev:clean` | Borra `.next` y arranca limpio |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |

## Subir a GitHub (ejemplo)

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

**No subas** el archivo `.env` (ya está en `.gitignore`). En el hosting (Vercel, etc.) configura las mismas variables allí.
