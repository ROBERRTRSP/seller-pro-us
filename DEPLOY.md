# Despliegue (Git + Neon + Vercel)

## 1. Base de datos (Neon)

1. Crea un proyecto en [Neon](https://neon.tech) y copia las URLs de PostgreSQL ([guía Prisma + Neon](https://neon.tech/docs/guides/prisma)).
2. En Vercel → tu proyecto → **Settings → Environment Variables**:
   - **`DATABASE_URL`** = URL **pooled** (serverless / `-pooler`), con `sslmode=require` si aplica.
   - **`DIRECT_URL`** = URL **direct** (sin pooler), para `prisma migrate deploy` en el build. Si falta o es solo pooler, el deploy puede fallar con **P1002** (timeout).
   - Opcional en la query string: `connect_timeout=60` para dar tiempo a que arranque el compute de Neon.
3. El build ejecuta `prisma migrate deploy`: aplica las migraciones en `prisma/migrations/`.

### Si el build falla con `P1002`

- Asegura **`DIRECT_URL`** en Vercel (Neon → **Connection details** → pestaña **direct**).
- Revisa que **`DATABASE_URL`** y **`DIRECT_URL`** estén en **Production** (y Preview si despliegas previews).
- Añade `connect_timeout=60` a ambas URLs si sigue habiendo timeout.

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
| `DATABASE_URL` | Sí | Postgres Neon **pooled** (runtime) |
| `DIRECT_URL` | Sí en Vercel | Neon **direct** (migraciones en build; en local puede igualar `DATABASE_URL`) |
| `AUTH_SECRET` | Sí | Mínimo 16 caracteres; mejor 32+ aleatorios |
| `BLOB_READ_WRITE_TOKEN` | Recomendada en prod | Sin ella, las subidas intentan escribir en disco (no válido en serverless) |

El esquema Prisma usa `directUrl` → variable **`DIRECT_URL`** (ver tabla arriba).

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
