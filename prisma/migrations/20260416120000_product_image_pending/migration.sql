-- AlterTable
ALTER TABLE "Product" ADD COLUMN "imagePending" BOOLEAN NOT NULL DEFAULT false;

-- Quitar fotos genéricas / no verificadas: catálogo = pendiente hasta subida o URL verificada en Admin
UPDATE "Product"
SET
  "imagePending" = true,
  "imageUrl" = NULL
WHERE
  "imageUrl" IS NULL
  OR TRIM(BOTH FROM "imageUrl") = ''
  OR LOWER("imageUrl") LIKE '%picsum.photos%'
  OR LOWER("imageUrl") LIKE '%loremflickr%'
  OR LOWER("imageUrl") LIKE '%dummyimage%'
  OR LOWER("imageUrl") LIKE '%placekitten%'
  OR LOWER("imageUrl") LIKE '%placehold.co%'
  OR LOWER("imageUrl") LIKE '%via.placeholder%'
  OR LOWER("imageUrl") LIKE '%placeholder.com%'
  OR LOWER("imageUrl") LIKE '%source.unsplash%'
  OR LOWER("imageUrl") LIKE '%images.unsplash.com%'
  OR LOWER("imageUrl") LIKE '%unsplash.com/photos%'
  OR LOWER("imageUrl") LIKE '%pravatar.cc%'
  OR LOWER("imageUrl") LIKE '%ui-avatars.com%'
  OR LOWER("imageUrl") LIKE '%robohash.org%'
  OR LOWER("imageUrl") LIKE '%gravatar.com/avatar%'
  OR LOWER("imageUrl") LIKE '%/thumb/%';
