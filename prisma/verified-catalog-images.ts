/**
 * Imágenes directas (Commons) asociadas al nombre del producto en catálogo.
 * Solo entradas donde la foto corresponde al artículo (misma línea / presentación razonable).
 * El script `apply-verified-catalog-images.ts` aplica esto en BD (`imagePending: false`).
 */
import { APRIL_PRODUCT_IMAGE_BY_NAME } from "./april-product-image-urls";

/** Nombres en tienda AAA → misma URL que la clave detallada en el mapa abril. */
const NAME_ALIASES: Record<string, keyof typeof APRIL_PRODUCT_IMAGE_BY_NAME> = {
  "Fiji Water": "Fiji Water 500 ML",
  "Mobil 1": "Mobil 1 Motor Oil",
  "Tide Simply": "Tide Simply All In One",
  "Downy": "Downy Fabric Softener",
  "Tylenol": "Tylenol Extra Strength",
};

function buildVerifiedMap(): Record<string, string> {
  const out: Record<string, string> = { ...APRIL_PRODUCT_IMAGE_BY_NAME };
  for (const [storeName, sourceKey] of Object.entries(NAME_ALIASES)) {
    out[storeName] = APRIL_PRODUCT_IMAGE_BY_NAME[sourceKey];
  }
  return out;
}

export const VERIFIED_CATALOG_IMAGES: Record<string, string> = buildVerifiedMap();
