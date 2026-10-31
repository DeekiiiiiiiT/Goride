/** Parts catalog CSV. No Papa Parse — callers pass header rows or raw text. */

export type PartsCatalogCsvRow = {
  interchangeCode: string;
  label: string;
  manufacturer: string;
  partNumber: string;
  partName: string;
  partKind: string;
  fitScope: string;
  targetKind: string;
  targetCode: string;
  yearFrom: number | null;
  yearTo: number | null;
  position: string | null;
  componentOpCode: string | null;
  categorySlug: string;
  supersedes: string | null;
};

const KINDS = new Set(["oem", "oe_supplier", "aftermarket", "used", "reman"]);
const SCOPES = new Set(["powertrain", "chassis", "body", "electrical", "universal"]);
const TARGETS = new Set(["engine_family", "platform", "catalog_variant"]);

const HEADER_MAP: Record<string, keyof PartsCatalogCsvRow> = {
  interchange_code: "interchangeCode",
  "interchange code": "interchangeCode",
  label: "label",
  manufacturer: "manufacturer",
  part_number: "partNumber",
  "part number": "partNumber",
  part_name: "partName",
  "part name": "partName",
  name: "partName",
  part_kind: "partKind",
  "part kind": "partKind",
  kind: "partKind",
  fit_scope: "fitScope",
  "fit scope": "fitScope",
  target_kind: "targetKind",
  "target kind": "targetKind",
  target_code: "targetCode",
  "target code": "targetCode",
  year_from: "yearFrom",
  "year from": "yearFrom",
  year_to: "yearTo",
  "year to": "yearTo",
  position: "position",
  component_op_code: "componentOpCode",
  "component op code": "componentOpCode",
  op_code: "componentOpCode",
  category_slug: "categorySlug",
  "category slug": "categorySlug",
  category: "categorySlug",
  supersedes: "supersedes",
};

function parseYear(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parsePartsCatalogCsv(text: string): { rows: PartsCatalogCsvRow[]; errors: string[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], errors: ["The file is empty."] };
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const errors: string[] = [];
  const rows: PartsCatalogCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every((c) => !c.trim())) continue;
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const key = HEADER_MAP[h];
      if (key) raw[key] = (cells[idx] ?? "").trim();
    });
    const built = buildPartsCatalogRow(raw, i + 1);
    if (built.error) errors.push(built.error);
    else if (built.row) rows.push(built.row);
  }
  return { rows, errors };
}

export function buildPartsCatalogRow(
  raw: Record<string, string>,
  lineNo: number,
): { row?: PartsCatalogCsvRow; error?: string } {
  const interchangeCode = (raw.interchangeCode ?? "").trim();
  const partNumber = (raw.partNumber ?? "").trim();
  const targetKind = (raw.targetKind ?? "").trim();
  const targetCode = (raw.targetCode ?? "").trim();
  const fitScope = (raw.fitScope ?? "").trim();
  const partKind = (raw.partKind ?? "oem").trim() || "oem";
  const categorySlug = (raw.categorySlug ?? "").trim();
  if (!interchangeCode || !partNumber || !targetKind || !targetCode || !fitScope || !categorySlug) {
    return { error: `Line ${lineNo}: interchange code, part number, fit scope, target kind, target code, and parts category are required.` };
  }
  if (!KINDS.has(partKind)) return { error: `Line ${lineNo}: unknown part kind “${partKind}”.` };
  if (!SCOPES.has(fitScope)) return { error: `Line ${lineNo}: unknown fit scope “${fitScope}”.` };
  if (!TARGETS.has(targetKind)) return { error: `Line ${lineNo}: unknown target kind “${targetKind}”.` };
  if (targetKind === "engine_family" && fitScope !== "powertrain" && fitScope !== "universal") {
    return { error: `Line ${lineNo}: an engine rule is only allowed for powertrain or universal parts.` };
  }
  return {
    row: {
      interchangeCode,
      label: (raw.label ?? "").trim() || interchangeCode,
      manufacturer: (raw.manufacturer ?? "").trim(),
      partNumber,
      partName: (raw.partName ?? "").trim() || partNumber,
      partKind,
      fitScope,
      targetKind,
      targetCode,
      yearFrom: parseYear(raw.yearFrom ?? ""),
      yearTo: parseYear(raw.yearTo ?? ""),
      position: (raw.position ?? "").trim() || null,
      componentOpCode: (raw.componentOpCode ?? "").trim() || null,
      categorySlug,
      supersedes: (raw.supersedes ?? "").trim() || null,
    },
  };
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
