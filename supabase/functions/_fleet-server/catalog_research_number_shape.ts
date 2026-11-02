/** OEM part number shape checks (audit B3 step 2). */

export function normalizePartNumberNorm(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export type NumberShapeResult = "ok" | "review" | "invalid";

export function checkPartNumberShape(brand: string, partNumber: string): NumberShapeResult {
  const norm = normalizePartNumberNorm(partNumber);
  if (!norm) return "invalid";
  const b = brand.trim().toLowerCase();
  if (b.includes("toyota") || b.includes("daihatsu")) {
    return /^\d{5}[A-Z0-9]{5}$/.test(norm) ? "ok" : "review";
  }
  if (b.includes("honda")) {
    return /^\d{5}[A-Z0-9]{6}$/.test(norm) ? "ok" : "review";
  }
  return "ok";
}

/** Strip marketing suffixes from Gemini brand strings. */
export function stripResearchBrandSuffix(raw: string): string {
  return String(raw || "")
    .replace(/\(\s*oem\s*\)/gi, "")
    .replace(/\(\s*genuine\s*\)/gi, "")
    .replace(/\bgenuine\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match to an existing part_master.manufacturer spelling when possible. */
export function normalizeResearchBrand(raw: string, knownManufacturers: string[]): string {
  const stripped = stripResearchBrandSuffix(raw);
  if (!stripped) return stripped;
  const lower = stripped.toLowerCase();
  for (const m of knownManufacturers) {
    const ml = m.toLowerCase();
    if (ml === lower || lower.includes(ml) || ml.includes(lower)) return m;
  }
  const first = stripped.split(/\s+/)[0] || stripped;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** Display/storage form with OEM dashes when digits-only. */
export function formatOemPartNumber(brand: string, partNumber: string): string {
  const raw = String(partNumber || "").trim();
  if (!raw) return raw;
  if (/-/.test(raw)) return raw.toUpperCase();
  const norm = normalizePartNumberNorm(raw);
  const b = brand.trim().toLowerCase();
  if ((b.includes("toyota") || b.includes("daihatsu")) && /^\d{5}[A-Z0-9]{5}$/.test(norm)) {
    return `${norm.slice(0, 5)}-${norm.slice(5)}`;
  }
  if (b.includes("honda") && /^\d{5}[A-Z0-9]{6}$/.test(norm)) {
    return `${norm.slice(0, 5)}-${norm.slice(5, 8)}-${norm.slice(8)}`;
  }
  return norm || raw.toUpperCase();
}

export function normalizeResearchCandidate(
  brand: string,
  partNumber: string,
  knownManufacturers: string[],
): { brand: string; partNumber: string; partNumberNorm: string } {
  const normalizedBrand = normalizeResearchBrand(brand, knownManufacturers);
  const formattedNumber = formatOemPartNumber(normalizedBrand, partNumber);
  return {
    brand: normalizedBrand,
    partNumber: formattedNumber,
    partNumberNorm: normalizePartNumberNorm(formattedNumber),
  };
}
