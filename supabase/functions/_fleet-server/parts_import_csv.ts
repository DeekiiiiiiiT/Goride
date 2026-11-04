/** RFC 4180-ish CSV parse for parts import (server). */
import { parse } from "jsr:@std/csv/parse";

const FORBIDDEN = /^(price|cost|supplier|stock|qty|quantity)$/i;

export type ParsedImportFile = {
  headers: string[];
  rows: Array<{ line_no: number; raw: Record<string, string> }>;
  headerErrors: Array<{ code: string; message: string }>;
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Required header keys per import kind (mirrors part_import_template columns where required = true). */
const REQUIRED_BY_KIND: Record<string, string[]> = {
  area: ["vehicle", "part_type", "brand", "part_number", "match_type", "year_from", "year_to", "source_url"],
  vehicle_oe: ["vehicle", "part_type", "oe_brand", "oe_number", "source_url"],
  part_cross_ref: ["brand", "part_number", "source_url"],
  platform_link: ["platform_a", "platform_b", "part_type", "scope", "source_url"],
  car_specs: ["vehicle", "spec_key", "spec_value", "source_url"],
};

export function parsePartsImportCsv(text: string, importKind = "area"): ParsedImportFile {
  let body = text.replace(/^\uFEFF/, "");
  const headerErrors: ParsedImportFile["headerErrors"] = [];
  const delimiter = body.includes(";") && !body.includes(",") ? ";" : ",";
  const records = parse(body, { skipFirstRow: false, separator: delimiter }) as string[][];
  if (!records.length) {
    return { headers: [], rows: [], headerErrors: [{ code: "PARSER_SCHEMA_REJECTED", message: "Empty file" }] };
  }
  const headerRow = records[0].filter((c) => c.trim() !== "" || records[0].length === 1);
  const headers = headerRow.map(normHeader);
  for (const h of headers) {
    if (FORBIDDEN.test(h)) {
      headerErrors.push({ code: "SCHEMA_INVALID", message: `Column "${h}" is not allowed` });
    }
  }
  const required = REQUIRED_BY_KIND[importKind] ?? REQUIRED_BY_KIND.area;
  const aliases: Record<string, string> = {
    manufacturer: "brand",
    job: "part_type",
    op_code: "part_type",
    part_kind: "match_type",
    evidence_url: "source_url",
  };
  const mapped = headers.map((h) => aliases[h] ?? h);
  for (const req of required) {
    if (!mapped.includes(req)) {
      headerErrors.push({ code: "SCHEMA_INVALID", message: `Missing column ${req}` });
    }
  }
  const rows: ParsedImportFile["rows"] = [];
  for (let i = 1; i < records.length; i++) {
    const line = records[i];
    if (line.every((c) => !String(c).trim())) continue;
    const raw: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = aliases[headers[c]!] ?? headers[c]!;
      raw[key] = String(line[c] ?? "").trim();
    }
    if (raw.note === "EXAMPLE") continue;
    rows.push({ line_no: i + 1, raw });
  }
  return { headers: mapped, rows, headerErrors };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type BadUploadDetail = {
  message: string;
  hexPrefix: string;
  detectedType: string;
};

function hexPrefix4(bytes: Uint8Array): string {
  const n = Math.min(4, bytes.length);
  return [...bytes.slice(0, n)].map((b) => b.toString(16).padStart(2, "0")).join(" ").toUpperCase();
}

export function detectBadUploadDetail(bytes: Uint8Array): BadUploadDetail | null {
  if (bytes.length < 1) return { message: "Empty file", hexPrefix: "", detectedType: "empty" };
  const hex = hexPrefix4(bytes);
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return { message: "ZIP/OOXML archive (looks like .xlsx)", hexPrefix: hex, detectedType: "ZIP/XLSX" };
  }
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return { message: "Legacy Excel binary (.xls)", hexPrefix: hex, detectedType: "XLS" };
  }
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { message: "PDF document", hexPrefix: hex, detectedType: "PDF" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { message: "UTF-16 text (save as UTF-8 CSV)", hexPrefix: hex, detectedType: "UTF-16" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { message: "UTF-16 BE text (save as UTF-8 CSV)", hexPrefix: hex, detectedType: "UTF-16" };
  }
  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 256));
  if (sample.includes("\0")) {
    return { message: "Binary file (not plain CSV text)", hexPrefix: hex, detectedType: "binary" };
  }
  return null;
}

export function detectBadUpload(bytes: Uint8Array): string | null {
  return detectBadUploadDetail(bytes)?.message ?? null;
}
