# Despliegue (Git + Neon + Vercel)

## 1. Base de datos (Neon)

1. Crea un proyecto en [Neon](https://neon.tech) y copia el **connection string** (PostgreSQL).
2. En Vercel → tu proyecto → **Settings → Environment Variables**:
   - `DATABASE_URL` = URL de Neon (con `sslmode=require` si Neon lo indica).
3. El build ejecuta `prisma migrate deploy`: aplica las migraciones en `prisma/migrations/`.

Datos demo (usuarios y productos), **una vez** desde tu máquina con la URL de Neon:

```bash
export DATABASE_URL="postgresql://..."
npx prisma migrate deploy
npm run db:seed
```

No ejecutes `db:seed` en cada deploy de Vercel salvo que quieras resetear datos.

## 2. Secretos en Vercel

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `DATABASE_URL` | Sí | Postgres (Neon) |
| `AUTH_SECRET` | Sí | Mínimo 16 caracteres; mejor 32+ aleatorios |
| `BLOB_READ_WRITE_TOKEN` | Recomendada en prod | Sin ella, las subidas intentan escribir en disco (no válido en serverless) |

Opcional: Neon también ofrece URL **direct** para migraciones con pooler; si Prisma se queja, consulta la doc de Neon + Prisma (`directUrl`).

## 3. Almacenamiento de imágenes (Vercel Blob)

1. En Vercel: **Storage → Blob** → crea un store y enlázalo al proyecto.
2. Vercel inyecta `BLOB_READ_WRITE_TOKEN` al enlazar; o créala manualmente en Environment Variables.
3. Con el token, `/api/admin/upload` sube a Blob y devuelve una URL `https://…blob.vercel-storage.com/…`.

Sin token: en **local** las fotos se guardan en `public/uploads/` (como antes).

## 4. Git y Vercel

1. Sube el repo a GitHub/GitLab.
2. **Vercel → Add New Project** → importa el repo.
3. Framework: **Next.js**. Build: `npm run build` (ya incluye `migrate deploy`).
4. Asigna dominio y prueba login / admin / subida de foto.

## 5. Desarrollo local con Postgres

```bash
docker compose up -d
cp .env.example .env
# Ajusta DATABASE_URL al puerto 55432 si usas el compose del repo
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Para parar: `docker compose down`.

## 6. Migraciones nuevas

En local, con `DATABASE_URL` apuntando a una BD de desarrollo:

```bash
npx prisma migrate dev --nombre_descriptivo
```

Commit de la carpeta `prisma/migrations/`. En el siguiente deploy, Vercel aplicará `migrate deploy` automáticamente.
