/**
 * Validación y normalización de buffers de imagen (compartido por Admin upload e import masivo).
 */
export const MAX_CATALOG_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/jpeg": {
    ext: ".jpg",
    magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  "image/png": {
    ext: ".png",
    magic: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  "image/webp": {
    ext: ".webp",
    magic: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  "image/gif": {
    ext: ".gif",
    magic: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61,
  },
};

export function looksLikeHeicOrHeif(buf: Uint8Array): boolean {
  if (buf.length < 16) return false;
  const box = String.fromCharCode(buf[4], buf[5], buf[6], buf[7]);
  if (box !== "ftyp") return false;
  const brand = new TextDecoder("ascii", { fatal: false }).decode(buf.slice(8, 12));
  return /heic|heim|mif1|heix|hevc|msf1/i.test(brand);
}

function detectRuleFromMagic(buf: Uint8Array): (typeof ALLOWED)["image/jpeg"] | null {
  for (const rule of Object.values(ALLOWED)) {
    if (rule.magic(buf)) return rule;
  }
  return null;
}

export async function convertHeicBufferToJpeg(buf: Uint8Array): Promise<Uint8Array> {
  type HeicConvertFn = (options: {
    buffer: Buffer;
    format: "JPEG";
    quality?: number;
  }) => Promise<ArrayBuffer | Uint8Array | Buffer>;
  const mod = await import("heic-convert");
  const heicConvert = (mod.default ?? mod) as HeicConvertFn;
  const out = await heicConvert({
    buffer: Buffer.from(buf),
    format: "JPEG",
    quality: 0.9,
  });
  if (out instanceof Uint8Array) return out;
  return new Uint8Array(out);
}

export type NormalizedImage = {
  bytes: Uint8Array;
  ext: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

/**
 * Valida magic bytes, convierte HEIC→JPEG si aplica, rechaza si > maxBytes.
 */
export async function normalizeCatalogImageBuffer(
  buf: Uint8Array,
  maxBytes: number = MAX_CATALOG_IMAGE_BYTES,
): Promise<NormalizedImage | null> {
  if (buf.byteLength > maxBytes) return null;
  let normalized = buf;
  let forcedRule: (typeof ALLOWED)["image/jpeg"] | null = null;
  if (looksLikeHeicOrHeif(buf)) {
    try {
      normalized = await convertHeicBufferToJpeg(buf);
      forcedRule = ALLOWED["image/jpeg"];
    } catch {
      return null;
    }
    if (normalized.byteLength > maxBytes) return null;
  }
  const rule = forcedRule ?? detectRuleFromMagic(normalized);
  if (!rule) return null;
  const contentType =
    rule.ext === ".jpg" || rule.ext === ".jpeg"
      ? ("image/jpeg" as const)
      : rule.ext === ".png"
        ? ("image/png" as const)
        : rule.ext === ".webp"
          ? ("image/webp" as const)
          : ("image/gif" as const);
  return { bytes: normalized, ext: rule.ext === ".jpeg" ? ".jpg" : rule.ext, contentType };
}
