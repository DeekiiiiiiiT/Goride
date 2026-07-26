/**
 * Layer C — Roam platform fee (default 0 bps).
 * Fee base = fare only; tips excluded.
 * See docs/passenger-rides/MONEY_LEDGER_RULES.md
 */

/** Prefer env ROAM_PLATFORM_FEE_BPS, then dispatch_settings row, else 0. */
export function resolvePlatformFeeBps(settingsFeeBps?: number | null): number {
  const envRaw = Deno.env.get("ROAM_PLATFORM_FEE_BPS");
  if (envRaw != null && String(envRaw).trim() !== "") {
    const n = Number(envRaw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  const fromSettings = Number(settingsFeeBps ?? 0);
  if (Number.isFinite(fromSettings) && fromSettings >= 0) {
    return Math.floor(fromSettings);
  }
  return 0;
}

/** Fare-only fee in minor units; tips never included. */
export function computePlatformFeeMinor(fareMinor: number, feeBps: number): number {
  const fare = Math.max(0, Math.floor(Number(fareMinor) || 0));
  const bps = Math.max(0, Math.floor(Number(feeBps) || 0));
  if (fare <= 0 || bps <= 0) return 0;
  return Math.floor((fare * bps) / 10_000);
}
