/**
 * Catálogo: solo se muestra foto cuando no está pendiente y la URL pasa validación técnica.
 * Las URLs externas exigen confirmación humana (marca, tipo, presentación) vía API (`imageVerified`).
 * No se permiten placeholders genéricos (picsum, etc.) ni miniaturas típicas de /thumb/.
 */

const FORBIDDEN_SUBSTRINGS = [
  "picsum.photos",
  "loremflickr.com",
  "dummyimage.com",
  "placekitten.com",
  "placehold.co",
  "via.placeholder",
  "placeholder.com",
  "source.unsplash",
  "images.unsplash.com",
  "unsplash.com/photos",
  "pravatar.cc",
  "ui-avatars.com",
  "robohash.org",
  "gravatar.com/avatar",
] as const;

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;

export function isForbiddenStockImageUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  if (!lower) return true;
  for (const frag of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(frag)) return true;
  }
  if (lower.includes("/thumb/")) return true;
  return false;
}

/** Subida propia (local) o Blob de Vercel: se considera archivo real subido por el operador. */
export function isTrustedOperatorUploadImageUrl(url: string): boolean {
  const t = url.trim();
  if (t.startsWith("/uploads/")) return true;
  try {
    const u = new URL(t);
    /** Dominio propio con ruta `/uploads/` (p. ej. `https://tienda.com/uploads/uuid.jpg`). */
    if (u.pathname.startsWith("/uploads/")) return true;
    if (u.hostname.endsWith("blob.vercel-storage.com")) return true;
    if ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && t.includes("/uploads/")) return true;
  } catch {
    return false;
  }
  return false;
}

/** Enlace que no es subida/Blob: exige casilla de verificación en Admin. */
export function requiresExternalImageVerification(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  return !isTrustedOperatorUploadImageUrl(t);
}

/**
 * URL que apunta de forma razonable a un binario de imagen (no página HTML genérica).
 * Wikimedia: solo rutas directas a commons, no /thumb/.
 */
export function isTechnicallyDirectProductImageUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  if (isForbiddenStockImageUrl(t)) return false;
  if (t.startsWith("/uploads/")) return true;
  try {
    const u = new URL(t);
    const lower = u.href.toLowerCase();
    if (lower.startsWith("http:") && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
      return false;
    }
    if (!lower.startsWith("https://") && !(u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return false;
    }
    const path = u.pathname;
    if (path.startsWith("/uploads/")) return true;
    if (IMAGE_EXT.test(path) || IMAGE_EXT.test(u.href)) return true;
    if (u.hostname.endsWith("blob.vercel-storage.com")) return true;
    if (u.hostname.endsWith("wikimedia.org") && path.includes("/commons/") && IMAGE_EXT.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Foto lista para mostrarse en tienda (no pendiente + URL válida). */
export function productCatalogImageVisible(
  imagePending: boolean,
  imageUrl: string | null | undefined,
): boolean {
  if (imagePending) return false;
  return isTechnicallyDirectProductImageUrl(imageUrl ?? "");
}

/** Non-empty string (legacy checks). Prefer `productCatalogImageVisible`. */
export function hasNonEmptyImageUrl(imageUrl: string | null | undefined): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}

export type AdminImageResolution =
  | { ok: true; imageUrl: string | null; imagePending: boolean }
  | { ok: false; error: string };

export type AdminPatchImageResolution = AdminImageResolution | { ok: "unchanged" };

export function resolveProductImageForAdminCreate(body: {
  imageUrl?: string | null;
  imageVerified?: boolean;
}): AdminImageResolution {
  const raw = body.imageUrl;
  const trimmed =
    raw !== undefined && raw !== null && String(raw).trim() !== "" ? String(raw).trim() : null;
  const verified = body.imageVerified === true;

  if (!trimmed) {
    return { ok: true, imageUrl: null, imagePending: true };
  }
  if (!isTechnicallyDirectProductImageUrl(trimmed)) {
    return {
      ok: false,
      error:
        "La URL debe ser un enlace directo a imagen (p. ej. .jpg, .png, .webp, .gif) o una subida del sitio. No se permiten placeholders, páginas HTML ni miniaturas /thumb/.",
    };
  }
  if (isTrustedOperatorUploadImageUrl(trimmed)) {
    return { ok: true, imageUrl: trimmed, imagePending: false };
  }
  if (!verified) {
    return {
      ok: false,
      error:
        "Para enlaces externos, marca la casilla confirmando que la marca, el tipo de producto y la presentación coinciden con este artículo. Si no cumple, deja la foto pendiente (sin URL).",
    };
  }
  return { ok: true, imageUrl: trimmed, imagePending: false };
}

export function resolveProductImageForAdminPatch(
  existing: { imageUrl: string | null; imagePending: boolean },
  body: Partial<{ imageUrl: string | null; imageVerified: boolean }>,
): AdminPatchImageResolution {
  if (body.imageUrl === undefined && body.imageVerified === undefined) {
    return { ok: "unchanged" };
  }

  if (
    body.imageUrl === undefined &&
    body.imageVerified === true &&
    existing.imageUrl &&
    isTechnicallyDirectProductImageUrl(existing.imageUrl)
  ) {
    return { ok: true, imageUrl: existing.imageUrl, imagePending: false };
  }

  const raw = body.imageUrl !== undefined ? body.imageUrl : existing.imageUrl;
  const trimmed =
    raw === undefined || raw === null || String(raw).trim() === "" ? null : String(raw).trim();
  const verified = body.imageVerified === true;

  if (
    trimmed &&
    existing.imageUrl &&
    trimmed === existing.imageUrl.trim() &&
    !existing.imagePending
  ) {
    return { ok: true, imageUrl: trimmed, imagePending: false };
  }

  if (!trimmed) {
    return { ok: true, imageUrl: null, imagePending: true };
  }
  if (!isTechnicallyDirectProductImageUrl(trimmed)) {
    return {
      ok: false,
      error:
        "La URL debe ser un enlace directo a imagen o una subida del sitio. No se permiten placeholders ni miniaturas /thumb/.",
    };
  }
  if (isTrustedOperatorUploadImageUrl(trimmed)) {
    return { ok: true, imageUrl: trimmed, imagePending: false };
  }
  if (!verified) {
    return {
      ok: false,
      error:
        "Para enlaces externos, marca la casilla confirmando marca, tipo de producto y presentación, o sube un archivo.",
    };
  }
  return { ok: true, imageUrl: trimmed, imagePending: false };
}
