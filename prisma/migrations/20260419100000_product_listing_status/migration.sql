-- Merchandising status (draft = not ready for storefront photo workflow).
ALTER TABLE "Product" ADD COLUMN "listing_status" TEXT NOT NULL DEFAULT 'published';
