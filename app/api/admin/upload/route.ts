import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/api-auth";
import { MAX_CATALOG_IMAGE_BYTES, normalizeCatalogImageBuffer } from "@/lib/catalog-asset-ingest";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const gate = await requireRole(Role.ADMIN);
  if ("error" in gate && gate.error) return gate.error;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    console.error("[upload] formData", e);
    return NextResponse.json(
      {
        error:
          "No se pudo leer el archivo (demasiado grande o conexión interrumpida). Prueba una foto menor a 8 MB.",
      },
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
    return NextResponse.json({ error: 'No se envió archivo (el campo debe llamarse "file").' }, { status: 400 });
  }

  const blob = entry as Blob;
  if (blob.size > MAX_CATALOG_IMAGE_BYTES) {
    return NextResponse.json({ error: "La imagen supera 8 MB." }, { status: 400 });
  }

  let buf: Uint8Array;
  try {
    buf = new Uint8Array(await blob.arrayBuffer());
  } catch (e) {
    console.error("[upload] arrayBuffer", e);
    return NextResponse.json({ error: "No se pudieron leer los datos del archivo." }, { status: 400 });
  }

  if (buf.byteLength > MAX_CATALOG_IMAGE_BYTES) {
    return NextResponse.json({ error: "La imagen supera 8 MB." }, { status: 400 });
  }

  let normalized: Awaited<ReturnType<typeof normalizeCatalogImageBuffer>>;
  try {
    normalized = await normalizeCatalogImageBuffer(buf, MAX_CATALOG_IMAGE_BYTES);
  } catch (e) {
    console.error("[upload] normalize", e);
    return NextResponse.json(
      {
        error:
          "No se pudo convertir la foto HEIC/HEIF. En iPhone o iPad usa Settings > Camera > Formats > Most Compatible, o guarda/exporta la foto como JPG/PNG.",
      },
      { status: 400 },
    );
  }

  if (!normalized) {
    return NextResponse.json(
      {
        error:
          "Imagen no reconocida. Usa JPG, PNG, WebP o GIF (máx. 8 MB). En iPhone/iPad prueba «Más compatible» en Cámara o pega una URL de imagen.",
      },
      { status: 400 },
    );
  }

  const name = `${randomUUID()}${normalized.ext}`;
  const contentType = normalized.contentType;

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
      const uploaded = await put(pathname, Buffer.from(normalized.bytes), {
        access: "public",
        contentType,
        token: blobToken,
      });
      return NextResponse.json({ url: uploaded.url });
    } catch (e) {
      console.error("[upload] vercel blob", e);
      return NextResponse.json(
        {
          error:
            "No se pudo subir al almacenamiento Blob. Revisa BLOB_READ_WRITE_TOKEN y la tienda Blob en Vercel.",
        },
        { status: 500 },
      );
    }
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  const fullPath = path.join(dir, name);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, normalized.bytes);
  } catch (e) {
    console.error("[upload] writeFile", e);
    return NextResponse.json(
      {
        error:
          "No se pudo guardar el archivo en el servidor. En Vercel configura BLOB_READ_WRITE_TOKEN (Storage → Blob). En local comprueba permisos de escritura en public/uploads.",
      },
      { status: 500 },
    );
  }

  const url = `/uploads/${name}`;
  return NextResponse.json({ url });
}
