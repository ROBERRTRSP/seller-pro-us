import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/api-auth";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

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

function looksLikeHeicOrHeif(buf: Uint8Array): boolean {
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

async function convertHeicToJpeg(buf: Uint8Array): Promise<Uint8Array> {
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

export async function POST(req: Request) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    console.error("[upload] formData", e);
    return NextResponse.json(
      { error: "Could not read the upload (file too large or connection interrupted)." },
      { status: 400 },
    );
  }

  const entry = formData.get("file");
  if (
    entry == null ||
    typeof entry !== "object" ||
    !("arrayBuffer" in entry) ||
    typeof (entry as Blob).size !== "number"
  ) {
    return NextResponse.json({ error: 'Missing file (form field must be named "file").' }, { status: 400 });
  }

  const blob = entry as Blob;
  if (blob.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image exceeds 8 MB." }, { status: 400 });
  }

  let buf: Uint8Array;
  try {
    buf = new Uint8Array(await blob.arrayBuffer());
  } catch (e) {
    console.error("[upload] arrayBuffer", e);
    return NextResponse.json({ error: "Could not read the file data." }, { status: 400 });
  }

  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Image exceeds 8 MB." }, { status: 400 });
  }

  const isHeicOrHeif = looksLikeHeicOrHeif(buf);
  let normalized = buf;
  let forcedRule: (typeof ALLOWED)["image/jpeg"] | null = null;
  if (isHeicOrHeif) {
    try {
      normalized = await convertHeicToJpeg(buf);
      forcedRule = ALLOWED["image/jpeg"];
    } catch (e) {
      console.error("[upload] heic convert", e);
      return NextResponse.json(
        {
          error:
            "No se pudo convertir la foto HEIC/HEIF. En iPhone o iPad usa Settings > Camera > Formats > Most Compatible, o guarda/exporta la foto como JPG/PNG.",
        },
        { status: 400 },
      );
    }
    if (normalized.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "La foto convertida supera 8 MB. Intenta con una imagen mas pequena." },
        { status: 400 },
      );
    }
  }

  const declaredType = (blob as File).type || "application/octet-stream";
  const fromDeclared = ALLOWED[declaredType];
  const rule =
    forcedRule ??
    (fromDeclared && fromDeclared.magic(normalized) ? fromDeclared : detectRuleFromMagic(normalized));

  if (!rule) {
    return NextResponse.json(
      {
        error:
          "Unrecognized image. Use JPG, PNG, WebP or GIF (max 8 MB). If the photo is from an iPhone or iPad, try Most Compatible or paste an image URL.",
      },
      { status: 400 },
    );
  }

  const name = `${randomUUID()}${rule.ext}`;
  const contentType =
    rule.ext === ".jpg" || rule.ext === ".jpeg"
      ? "image/jpeg"
      : rule.ext === ".png"
        ? "image/png"
        : rule.ext === ".webp"
          ? "image/webp"
          : "image/gif";

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!blobToken && process.env.VERCEL) {
    return NextResponse.json(
      {
        error:
          "Subidas en Vercel requieren Blob: proyecto → Storage → Create Blob Store → Connect to Project (o en Settings → Environment Variables añade BLOB_READ_WRITE_TOKEN). Luego Redeploy.",
      },
      { status: 503 },
    );
  }

  if (blobToken) {
    try {
      const pathname = `products/${name}`;
      const uploaded = await put(pathname, Buffer.from(normalized), {
        access: "public",
        contentType,
        token: blobToken,
      });
      return NextResponse.json({ url: uploaded.url });
    } catch (e) {
      console.error("[upload] vercel blob", e);
      return NextResponse.json(
        { error: "Could not upload to blob storage. Check BLOB_READ_WRITE_TOKEN and the Vercel Blob store." },
        { status: 500 },
      );
    }
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  const fullPath = path.join(dir, name);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, normalized);
  } catch (e) {
    console.error("[upload] writeFile", e);
    return NextResponse.json(
      {
        error:
          "Could not save the file on the server. For Vercel, set BLOB_READ_WRITE_TOKEN (Storage → Blob). Locally, ensure the app can write to public/uploads.",
      },
      { status: 500 },
    );
  }

  const url = `/uploads/${name}`;
  return NextResponse.json({ url });
}
