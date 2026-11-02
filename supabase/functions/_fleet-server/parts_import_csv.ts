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

export function parsePartsImportCsv(text: string): ParsedImportFile {
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
  const required = ["vehicle", "part_type", "brand", "part_number", "match_type", "year_from", "year_to", "source_url"];
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

export function detectBadUpload(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "ZIP/OOXML archive (looks like .xlsx)";
  }
  return null;
}
