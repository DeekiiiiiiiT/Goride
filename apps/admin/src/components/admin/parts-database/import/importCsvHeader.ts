/** Client-side CSV header parse — keep in sync with supabase/functions/_fleet-server/parts_import_csv.ts */

const FORBIDDEN = /^(price|cost|supplier|stock|qty|quantity)$/i;

const REQUIRED = ["vehicle", "part_type", "brand", "part_number", "match_type", "source_url"] as const;

const ALIASES: Record<string, string> = {
  manufacturer: "brand",
  job: "part_type",
  op_code: "part_type",
  part_kind: "match_type",
  evidence_url: "source_url",
};

export type ImportTemplateColumnDef = {
  name: string;
  required?: boolean;
  type?: string;
};

export type ImportColumnRowStatus = "template" | "in_file" | "missing_required" | "missing_optional" | "extra";

export type ImportColumnRow = {
  name: string;
  required: boolean;
  format: string;
  status: ImportColumnRowStatus;
  rawHeader?: string;
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function splitCsvHeaderLine(line: string): string[] {
  const delimiter = line.includes(";") && !line.includes(",") ? ";" : ",";
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim().replace(/^"|"$/g, ""));
}

export function parseImportCsvHeaders(
  text: string,
  templateColumns: ImportTemplateColumnDef[] = DEFAULT_IMPORT_TEMPLATE_COLUMNS,
): {
  headers: string[];
  mapped: string[];
  headerErrors: string[];
} {
  const headerErrors: string[] = [];
  let body = text.replace(/^\uFEFF/, "");
  const firstLine = body.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  if (!firstLine.trim()) {
    return { headers: [], mapped: [], headerErrors: ["Empty file"] };
  }
  const headerRow = splitCsvHeaderLine(firstLine).filter((c) => c !== "" || firstLine.split(/[,;]/).length === 1);
  const headers = headerRow.map(normHeader);
  const mapped = headers.map((h) => ALIASES[h] ?? h);

  for (const h of headers) {
    if (FORBIDDEN.test(h)) {
      headerErrors.push(`Missing column: ${h}`);
      headerErrors.push(`Not allowed: ${h} — fleet pricing columns are blocked`);
    }
  }
  const requiredNames = templateColumns.filter((c) => c.required === true).map((c) => c.name);
  for (const req of requiredNames.length ? requiredNames : REQUIRED) {
    if (!mapped.includes(req)) {
      headerErrors.push(`Missing column: ${req}`);
    }
  }
  for (const m of mapped) {
    if (!templateColumns.some((c) => c.name === m) && !["note"].includes(m)) {
      const raw = headers[mapped.indexOf(m)] ?? m;
      headerErrors.push(`Not allowed: ${raw} — not in the ${templateColumns[0]?.name ? "area" : "area"} template`);
    }
  }
  return { headers, mapped, headerErrors };
}

const FORMAT_BY_COLUMN: Record<string, string> = {
  vehicle: "Version id from the vehicle list, or make · model · chassis · year",
  part_type: "Must match this area's part types (e.g. BRK-PADS)",
  brand: "Manufacturer name (Toyota, Brembo, …)",
  part_number: "Catalog / OEM number without spaces",
  part_name: "Optional commercial name",
  match_type: "oem, sister, engine, aftermarket, or universal",
  year_from: "4-digit year",
  year_to: "4-digit year",
  source_url: "HTTPS link showing this part for this car",
  replaces_oem_number: "Optional cross-reference OEM",
  position: "Optional — Front, Rear, … when the part type uses positions",
  side: "Optional — Left, Right, … when applicable",
  note: "Optional staff note (rows with EXAMPLE in note are skipped)",
};

export const DEFAULT_IMPORT_TEMPLATE_COLUMNS: ImportTemplateColumnDef[] = [
  { name: "vehicle", required: true, type: "text" },
  { name: "part_type", required: true, type: "text" },
  { name: "brand", required: true, type: "text" },
  { name: "part_number", required: true, type: "text" },
  { name: "part_name", required: false, type: "text" },
  { name: "match_type", required: true, type: "text" },
  { name: "year_from", required: false, type: "integer" },
  { name: "year_to", required: false, type: "integer" },
  { name: "source_url", required: true, type: "url" },
  { name: "replaces_oem_number", required: false, type: "text" },
  { name: "position", required: false, type: "text" },
  { name: "side", required: false, type: "text" },
  { name: "note", required: false, type: "text" },
];

export function formatRuleForColumn(name: string): string {
  return FORMAT_BY_COLUMN[name] ?? "Template field";
}

export function buildImportColumnRows(
  templateColumns: ImportTemplateColumnDef[],
  mappedFileHeaders: string[],
  rawHeaders: string[],
  fileLoaded = mappedFileHeaders.length > 0,
): ImportColumnRow[] {
  if (!fileLoaded) {
    return templateColumns.map((col) => ({
      name: col.name,
      required: col.required === true,
      format: formatRuleForColumn(col.name),
      status: "template" as const,
    }));
  }
  const templateNames = new Set(templateColumns.map((c) => c.name));
  const inFile = new Set(mappedFileHeaders);
  const rows: ImportColumnRow[] = [];

  for (const col of templateColumns) {
    const present = inFile.has(col.name);
    let status: ImportColumnRowStatus;
    if (present) {
      status = "in_file";
    } else if (col.required) {
      status = "missing_required";
    } else {
      status = "missing_optional";
    }
    rows.push({
      name: col.name,
      required: col.required === true,
      format: formatRuleForColumn(col.name),
      status,
    });
  }

  const seenExtra = new Set<string>();
  for (let i = 0; i < mappedFileHeaders.length; i++) {
    const mapped = mappedFileHeaders[i]!;
    if (templateNames.has(mapped) || seenExtra.has(mapped)) continue;
    seenExtra.add(mapped);
    rows.push({
      name: mapped,
      required: false,
      format: "Not part of this template — remove or rename",
      status: "extra",
      rawHeader: rawHeaders[i] ?? mapped,
    });
  }

  return rows;
}

export function headerAlignmentSummary(rows: ImportColumnRow[], mappedFileHeaders: string[] = []) {
  if (rows.some((r) => r.status === "template")) {
    return { inFile: 0, total: rows.length, missingRequired: 0, extra: 0, ok: false, fileLoaded: false };
  }
  const fileColCount = mappedFileHeaders.length || rows.filter((r) => r.status === "in_file" || r.status === "extra").length;
  const missingRequired = rows.filter((r) => r.status === "missing_required").length;
  const extra = rows.filter((r) => r.status === "extra").length;
  const ok = missingRequired === 0 && extra === 0;
  return { inFile: fileColCount, total: fileColCount, missingRequired, extra, ok, fileLoaded: true };
}
