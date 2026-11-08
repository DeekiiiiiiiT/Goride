const PRODUCT_KEYS = new Set([
  "brake_fluid",
  "transmission_fluid",
  "coolant_type",
  "washer_fluid",
]);

/** Mirrors public.self_serve_catalog_spec_car_value for UI preview. */
export function carSpecValueForSave(
  specKey: string,
  brand: string,
  partNumber: string,
  specValue: string,
): string {
  const key = specKey.trim().toLowerCase();
  if (PRODUCT_KEYS.has(key)) {
    const merged = `${brand.trim()} ${partNumber.trim()}`.trim();
    return merged || specValue.trim();
  }
  return specValue.trim();
}
