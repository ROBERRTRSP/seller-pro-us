/**
 * Importación masiva de catálogo con imágenes locales o por URL → /public/uploads/products/
 *
 * Uso:
 *   npx tsx prisma/bulk-import-catalog.ts prisma/data/bulk-import.input.json
 *   npx tsx prisma/bulk-import-catalog.ts datos.csv
 *
 * JSON: array de objetos con category, brand, product_name, description?, pack_size?,
 * price, sku?, barcode?, stock?, source_url?, source_image_url?, local_image_path?
 */
import { readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  runBulkImportFromRows,
  type BulkImportInputRow,
  type BulkImportRowResult,
} from "../lib/bulk-catalog-import";

const prisma = new PrismaClient();

function splitCsvLine(line: string): string[] {
  const res: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && c === ",") {
      res.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  res.push(cur);
  return res;
}

function parseCsv(text: string): BulkImportInputRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_"),
  );
  const out: BulkImportInputRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cells[j] ?? "").trim();
    }
    out.push(row);
  }
  return out;
}

function loadRows(filePath: string): BulkImportInputRow[] {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const ext = path.extname(abs).toLowerCase();
  const raw = readFileSync(abs, "utf8");
  if (ext === ".json") {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) throw new Error("JSON root must be an array of product objects");
    return j as BulkImportInputRow[];
  }
  if (ext === ".csv") {
    return parseCsv(raw);
  }
  throw new Error("Unsupported file type (use .json or .csv)");
}

function printTable(rows: BulkImportRowResult[]) {
  console.log(
    "\n| brand | product_name | pack_size | price | source_url | source_image_url | image | image_status | status | outcome | error |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
    console.log(
      `| ${esc(r.brand)} | ${esc(r.product_name)} | ${esc(r.pack_size)} | ${esc(r.price)} | ${esc(r.source_url)} | ${esc(r.source_image_url)} | ${esc(r.image)} | ${esc(r.image_status)} | ${r.status} | ${r.outcome} | ${esc(r.error ?? "")} |`,
    );
  }
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error(
      "Usage: npx tsx prisma/bulk-import-catalog.ts <path-to.json-or.csv>\nExample: npx tsx prisma/bulk-import-catalog.ts prisma/data/bulk-import.input.json",
    );
    process.exit(1);
  }
  const rows = loadRows(fileArg);
  const summary = await runBulkImportFromRows(prisma, rows);
  printTable(summary.rows);
  console.log("\n--- Resumen ---");
  const { rows: _rowDetails, ...totalsOnly } = summary;
  console.log(JSON.stringify(totalsOnly, null, 2));
  console.log(
    JSON.stringify(
      {
        total_leidos: summary.totalRead,
        total_creados: summary.created,
        total_actualizados: summary.updated,
        con_foto: summary.withPhoto,
        sin_foto: summary.withoutPhoto,
        en_draft: summary.draft,
        activos: summary.active,
        duplicados_omitidos: summary.skippedDuplicate,
        con_error: summary.errors,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
