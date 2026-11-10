/**
 * Text copied for an auto store: the car, the part, whose number it is,
 * and the other brands' numbers for the same part, so any store can look it up.
 * Only values we hold are used; anything missing is left out, never guessed.
 */
export type StoreBrandNumber = { brand: string; number: string };

export function buildStoreCopyText(input: {
  carLine: string;
  /** e.g. "Chassis: M900A · Drive: 2WD" */
  carDetails?: string;
  version?: string;
  partName?: string;
  number: string;
  /** Maker the number belongs to (e.g. "Daihatsu"); unlabelled when unknown. */
  numberBrand?: string;
  brandNumbers?: StoreBrandNumber[];
}): string {
  const num = input.number.trim();
  const numberBrand = input.numberBrand?.trim();
  const numberLine = numberBrand ? `${numberBrand} number: ${num}` : `Part number: ${num}`;

  const seen = new Set<string>();
  const others: string[] = [];
  for (const b of input.brandNumbers || []) {
    const brand = b.brand.trim();
    const n = b.number.trim();
    if (!n) continue;
    if (n === num && (!numberBrand || !brand || brand.toLowerCase() === numberBrand.toLowerCase())) continue;
    const label = brand ? `${brand} ${n}` : n;
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    others.push(label);
  }

  return [
    input.carLine,
    input.carDetails || "",
    input.version || "",
    input.partName || "",
    numberLine,
    others.length ? `Also sold as: ${others.join(" · ")}` : "",
  ]
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function carDetailsLine(parts: { chassis?: string; engine?: string; drive?: string }): string {
  return [
    parts.chassis?.trim() ? `Chassis: ${parts.chassis.trim()}` : "",
    parts.engine?.trim() ? `Engine: ${parts.engine.trim()}` : "",
    parts.drive?.trim() ? `Drive: ${parts.drive.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
