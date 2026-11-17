import { mapVehicleColor, type VehicleColor } from "./color.ts";

/** §3.5 whitelist (18 keys, Rev 7). */
export const DOCUMENT_FIELD_WHITELIST = [
  "plate",
  "vin",
  "chassis",
  "engineNumber",
  "cc",
  "make",
  "model",
  "year",
  "colorAsWritten",
  "bodyAsWritten",
  "fuel",
  "seating",
  "certificateNumber",
  "controlNumber",
  "mvid",
  "laNumber",
  "issueDate",
  "expiryDate",
] as const;

export type DocumentFieldKey = (typeof DOCUMENT_FIELD_WHITELIST)[number];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function whitelistDocumentFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of DOCUMENT_FIELD_WHITELIST) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month1to12: number): string {
  const d = new Date(Date.UTC(year, month1to12, 0));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseIsoDate(s: string): string | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, da));
  if (
    probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== da
  ) return null;
  return `${y}-${pad2(mo)}-${pad2(da)}`;
}

/** Parse certificate dates without guessing ambiguous digit order (§3.5). */
export function normalizeDocumentDate(
  raw: string,
  kind: "fitness" | "registration-issue" | "registration-expiry",
): string | null {
  const t = raw.trim();
  if (kind === "registration-issue") return parseIsoDate(t);

  if (kind === "fitness") {
    const parts = t.split(/[/\s]+/).filter(Boolean);
    if (parts.length !== 3) return null;
    const y = Number(parts[0]);
    const mo = Number(parts[1]);
    const da = Number(parts[2]);
    if (!y || !mo || !da) return null;
    return parseIsoDate(`${y}-${pad2(mo)}-${pad2(da)}`);
  }

  // registration-expiry: year + month only → last day of that month
  const slash = t.match(/^(\d{4})\s*\/\s*([A-Za-z]{3}|\d{1,2})$/);
  if (!slash) return null;
  const y = Number(slash[1]);
  const monthPart = slash[2];
  let mo: number;
  if (/^\d+$/.test(monthPart)) mo = Number(monthPart);
  else mo = MONTHS[monthPart.toLowerCase().slice(0, 3)] ?? 0;
  if (mo < 1 || mo > 12) return null;
  return lastDayOfMonth(y, mo);
}

export type DateCheckInput = {
  year?: string | number | null;
  issueDate?: string | null;
  expiryDate?: string | null;
};

export type DateCheckResult = DateCheckInput & { flagged: string[] };

export function checkDocumentDates(
  input: DateCheckInput,
  today: Date,
): DateCheckResult {
  const flagged: string[] = [];
  const yearNum = input.year != null && input.year !== "" ? Number(input.year) : null;
  let issueDate = input.issueDate ?? null;
  let expiryDate = input.expiryDate ?? null;

  const maxYear = today.getUTCFullYear() + 1;
  if (yearNum != null && (yearNum < 1980 || yearNum > maxYear)) {
    flagged.push("year");
  }

  if (issueDate && expiryDate && expiryDate < issueDate) {
    expiryDate = null;
    flagged.push("expiryDate");
  }

  if (expiryDate && issueDate) {
    const expY = Number(expiryDate.slice(0, 4));
    const issY = Number(issueDate.slice(0, 4));
    if (expY > issY + 5) {
      expiryDate = null;
      flagged.push("expiryDate");
    }
  }

  return {
    year: yearNum != null && !flagged.includes("year") ? yearNum : input.year,
    issueDate,
    expiryDate,
    flagged,
  };
}

function normChassis(ch: string | null | undefined): string {
  return (ch ?? "").replace(/[\s-]/g, "").toUpperCase();
}

export type DocFields = {
  plate?: string | null;
  chassis?: string | null;
  colorAsWritten?: string | null;
};

export type CompareDocumentsResult = {
  plate: string | null;
  chassisMismatch: boolean;
  colorConflict: boolean;
  defaultColor: VehicleColor | null;
  registrationColorAsWritten: string | null;
};

export function compareDocuments(
  fitness: DocFields,
  registration: DocFields,
): CompareDocumentsResult {
  const plate = registration.plate?.trim() || null;
  // Only two chassis numbers that were both read can disagree; a missing one is not "different vehicles".
  const fitChassis = normChassis(fitness.chassis);
  const regChassis = normChassis(registration.chassis);
  const chassisMismatch = fitChassis !== "" && regChassis !== "" && fitChassis !== regChassis;
  const fitColor = mapVehicleColor(fitness.colorAsWritten ?? "");
  const regColor = mapVehicleColor(registration.colorAsWritten ?? "");
  const colorConflict = fitColor != null && regColor != null && fitColor !== regColor;

  return {
    plate,
    chassisMismatch,
    colorConflict,
    defaultColor: fitColor,
    registrationColorAsWritten: registration.colorAsWritten ?? null,
  };
}