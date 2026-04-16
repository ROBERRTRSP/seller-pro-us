-- Source-derived availability (e.g. in_stock, backorder, sold_out) for catalog imports.
ALTER TABLE "Product" ADD COLUMN "availability" TEXT;
