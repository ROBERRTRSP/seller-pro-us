-- AlterTable
ALTER TABLE "SiteSettings"
ADD COLUMN IF NOT EXISTS "minimum_order_cents" INTEGER NOT NULL DEFAULT 0;
