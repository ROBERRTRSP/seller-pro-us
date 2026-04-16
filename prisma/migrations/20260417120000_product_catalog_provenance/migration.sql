-- Catalog provenance, age gating, and draft visibility (shopper API filters on catalog_published).
ALTER TABLE "Product" ADD COLUMN "brand" TEXT;
ALTER TABLE "Product" ADD COLUMN "size" TEXT;
ALTER TABLE "Product" ADD COLUMN "pack_size" TEXT;
ALTER TABLE "Product" ADD COLUMN "source_url" TEXT;
ALTER TABLE "Product" ADD COLUMN "image_status" TEXT;
ALTER TABLE "Product" ADD COLUMN "age_restricted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "minimum_age" INTEGER;
ALTER TABLE "Product" ADD COLUMN "catalog_published" BOOLEAN NOT NULL DEFAULT true;
