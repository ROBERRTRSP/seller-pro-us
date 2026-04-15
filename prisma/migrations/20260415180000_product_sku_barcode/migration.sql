-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sku" TEXT,
ADD COLUMN     "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");
