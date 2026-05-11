// Pure helper for deriving the OEM chassis / frame index ("prefix") from a
// raw VIN or chassis number on a Jamaican-style registration / fitness
// certificate.
//
// Examples:
//   - "M900A0344862"      -> "M900A"   (single token, trailing serial)
//   - "DBA-M900A-GBME"    -> "M900A"   (dash-separated full model code)
//   - "JTDBR32E430123456" -> "JTDBR32E43"
//   - " m900a 0344862 "   -> "M900A"   (whitespace tolerated)
//   - null / "" / "   "   -> ""        (no-op safe defaults)
//
// The match endpoint runs an `ilike '%prefix%'` against `vehicle_catalog
// .chassis_code`, so the value we return only needs to be a substring of the
// canonical column value. We intentionally keep the heuristic small and
// always let the customer edit the result before the picker fires.

export function extractChassisPrefix(vin: string | null | undefined): string {
  if (!vin) return "";
  const cleaned = String(vin).trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return "";

  // Dash-separated full model code: take the middle segment when present
  // (matches "DBA-M900A-GBME" style codes from the import sheet) so we don't
  // accidentally feed the emissions prefix or the trim suffix to the matcher.
  if (cleaned.includes("-")) {
    const parts = cleaned.split("-").filter(Boolean);
    if (parts.length >= 2) return parts[1];
    if (parts.length === 1) return parts[0];
    return "";
  }

  // Single-token VIN: strip a trailing 7-digit unit serial. This covers both
  // 12-char Jamaican chassis numbers (M900A0344862 -> M900A) and 17-char
  // global VINs (JTDBR32E430123456 -> JTDBR32E43, where the last 7 chars are
  // the plant + serial portion of the VIS).
  const seven = cleaned.match(/^([A-Z0-9]+?)\d{7}$/);
  if (seven) return seven[1];

  // Fallback for shorter trailing serials (5-6 digits). Rare in practice but
  // keeps us tolerant of partial OCR reads.
  const shortRun = cleaned.match(/^([A-Z0-9]+?)\d{5,6}$/);
  if (shortRun) return shortRun[1];

  // Fallback: assume the whole string is already a prefix (operator typed it
  // in by hand, e.g. "M900A").
  return cleaned;
}
