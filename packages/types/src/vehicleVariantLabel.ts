/** Plain names for a car version, so a non-mechanic can choose. */

export type VariantLabelRow = {
  id?: string;
  chassis_code?: string | null;
  engine_code?: string | null;
  engine_displacement_l?: number | null;
  fuel_type?: string | null;
  fuel_category?: string | null;
  engine_type?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  body_type?: string | null;
  trim_series?: string | null;
};

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function fuelWord(row: VariantLabelRow): string {
  const blob = `${text(row.fuel_category)} ${text(row.fuel_type)} ${text(row.engine_type)}`.toLowerCase();
  if (blob.includes("hybrid")) return "hybrid";
  if (blob.includes("diesel")) return "diesel";
  return "petrol";
}

function sizeWord(row: VariantLabelRow): string | null {
  const raw = row.engine_displacement_l;
  if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) <= 0) return null;
  return Number(raw).toFixed(1);
}

function enginePhrase(row: VariantLabelRow): string {
  const size = sizeWord(row);
  if (!size) return "";
  return `${size} ${fuelWord(row)}`;
}

function turboWord(row: VariantLabelRow): string {
  return text(row.engine_type).toLowerCase().includes("turbo") ? "turbo" : "";
}

function differs(rows: VariantLabelRow[], pick: (row: VariantLabelRow) => string): boolean {
  const values = new Set(rows.map((row) => pick(row).trim().toLowerCase()));
  return values.size > 1;
}

/** Grey line under the card: chassis, engine code, transmission. */
export function variantCodeLine(row: VariantLabelRow): string {
  return [text(row.chassis_code), text(row.engine_code), text(row.transmission)].filter(Boolean).join(" · ");
}

/**
 * What to print on the card. Empty when there is only one version.
 * Keeps adding the next detail that is not the same on every sibling
 * until the cards in the group read differently.
 * Falls back to the chassis code only for rows that are still the same.
 */
export function variantPlainLabel(row: VariantLabelRow, siblings: VariantLabelRow[]): string {
  const group = siblings.length > 0 ? siblings : [row];
  if (group.length < 2) return "";
  const groups: Array<(item: VariantLabelRow) => string> = [
    enginePhrase,
    turboWord,
    (item) => text(item.drivetrain),
    (item) => text(item.transmission),
    (item) => text(item.body_type),
    (item) => text(item.trim_series),
  ];
  const picks = groups.filter((pick) => differs(group, pick));

  function phrase(item: VariantLabelRow, count: number): string {
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const value = picks[i](item).trim();
      if (value) parts.push(value);
    }
    return parts.join(" · ");
  }

  let count = 1;
  while (count <= picks.length) {
    const labels = group.map((item) => phrase(item, count));
    const unique = new Set(labels.map((label) => label.toLowerCase()));
    if (unique.size === group.length && labels.every(Boolean)) return phrase(row, count);
    count += 1;
  }

  const full = phrase(row, picks.length);
  const twins = group.filter((item) => phrase(item, picks.length).toLowerCase() === full.toLowerCase());
  const code = text(row.chassis_code);
  if (twins.length > 1 && code) return full ? `${full} · ${code}` : code;
  return full || code;
}
