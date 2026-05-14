/**
 * Best-effort carrier selection for Jamaica NANP (+1 876/658…).
 * Refine DIGICEL_PREFIXES / FLOW_PREFIXES from carrier documentation; MNP can mis-route.
 */

export type SmsCarrier = "digicel" | "flow";

function parsePrefixList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map(s => s.replace(/\D/g, ""))
    .filter(Boolean);
}

/** Returns 10-digit national number for +1XXXXXXXXXX, or null. */
export function nanpNationalTen(e164: string): string | null {
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  return null;
}

/**
 * Pick carrier: first Digicel prefix match wins; else Flow (default).
 */
export function pickCarrier(e164: string, digicelPrefixes: string[]): SmsCarrier {
  const national = nanpNationalTen(e164);
  if (!national) return "flow";
  for (const p of digicelPrefixes) {
    if (p && national.startsWith(p)) return "digicel";
  }
  return "flow";
}

export function loadPrefixListsFromEnv(): { digicel: string[] } {
  return {
    digicel: parsePrefixList(Deno.env.get("DIGICEL_PREFIXES")),
  };
}
