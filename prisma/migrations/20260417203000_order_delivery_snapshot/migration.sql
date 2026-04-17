-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryPhone" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryBusinessLicense" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryTobaccoLicense" TEXT;

UPDATE "Order" o
SET
  "deliveryPhone" = u."phone",
  "deliveryAddress" = u."address",
  "deliveryBusinessLicense" = u."businessLicense",
  "deliveryTobaccoLicense" = u."tobaccoLicense"
FROM "User" u
WHERE o."userId" = u.id;
