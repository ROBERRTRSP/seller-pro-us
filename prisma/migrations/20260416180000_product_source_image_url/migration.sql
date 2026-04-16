-- Original image URL reference (import / provenance); storefront uses imageUrl (local or blob).
ALTER TABLE "Product" ADD COLUMN "source_image_url" TEXT;
