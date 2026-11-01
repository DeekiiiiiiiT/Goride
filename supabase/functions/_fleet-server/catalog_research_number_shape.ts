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
    return /^\d{5}\d{3}\d{3}$/.test(norm) ? "ok" : "review";
  }
  return "review";
}
