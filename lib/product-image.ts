/** A product must have an image URL to appear in the public catalog. */
export function hasValidProductImage(imageUrl: string | null | undefined): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}
