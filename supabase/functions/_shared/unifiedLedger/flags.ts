/** Unified ledger feature flags (Phases 7–16 cutover). */

function envTruthy(name: string): boolean {
  const v = Deno.env.get(name);
  return v === "1" || v === "true" || v === "yes";
}

export function isLedgerDualWriteEnabled(): boolean {
  return envTruthy("LEDGER_DUAL_WRITE_ENABLED");
}

/** Per-island dual-write kill switches (Phase D). Default ON when global dual-write is on. */
export function isLedgerDualWriteIslandEnabled(island: string): boolean {
  if (!isLedgerDualWriteEnabled()) return false;
  const key = `LEDGER_DUAL_WRITE_${island.toUpperCase()}`;
  const v = Deno.env.get(key);
  if (v === undefined || v === "") return true;
  return v === "1" || v === "true" || v === "yes";
}

export function isLedgerReadUnifiedEnabled(): boolean {
  return envTruthy("LEDGER_READ_UNIFIED");
}

/** Phase B: compare unified vs legacy without changing responses. */
export function isLedgerShadowReadEnabled(): boolean {
  return envTruthy("LEDGER_SHADOW_READ");
}

export function isLedgerShadowIslandEnabled(island: string): boolean {
  if (!isLedgerShadowReadEnabled()) return false;
  const raw = Deno.env.get("LEDGER_SHADOW_ISLANDS")?.trim();
  if (!raw) return true;
  const allow = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return allow.has(island);
}

/** Phase C: per-product primary read from unified (legacy remains default when off). */
export function isLedgerReadUnifiedRidesEnabled(): boolean {
  return envTruthy("LEDGER_READ_UNIFIED_RIDES");
}

export function isLedgerReadUnifiedFleetEnabled(): boolean {
  // Permanent cutover: fleet money reads are ledger.entries-only.
  return true;
}

export function isLedgerReadUnifiedTollEnabled(): boolean {
  return envTruthy("LEDGER_READ_UNIFIED_TOLL");
}

export function isLedgerReadUnifiedDashEnabled(): boolean {
  return envTruthy("LEDGER_READ_UNIFIED_DASH");
}

/**
 * Phase D: stop appending money into legacy island stores.
 * Default ON (legacy still written). Set LEDGER_LEGACY_WRITE_<ISLAND>=0 after
 * that island’s read cutover is proven.
 */
export function isLedgerLegacyMoneyWriteEnabled(island: string): boolean {
  // Money ledger_event KV retired — never write island money rows.
  if (island === "kv_ledger_event") return false;
  const key = `LEDGER_LEGACY_WRITE_${island.toUpperCase()}`;
  const v = Deno.env.get(key);
  if (v === undefined || v === "") return true;
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Whether to post into ledger.entries for this island.
 * - Dual-write flag ON → post (classic mirror)
 * - Legacy write OFF → post (Phase D sole SSOT path for KV islands)
 * - Product primary-read ON → keep posting so flipped UIs stay current
 */
export function shouldPostUnifiedLedger(island: string): boolean {
  if (isLedgerDualWriteIslandEnabled(island)) return true;
  if (!isLedgerLegacyMoneyWriteEnabled(island)) return true;
  if (island === "rides_payment_journal" && isLedgerReadUnifiedRidesEnabled()) return true;
  if (island === "dash_payments" && isLedgerReadUnifiedDashEnabled()) return true;
  if (
    (island === "kv_ledger_event" || island === "financial_event" || island === "rides_ledger_lines") &&
    isLedgerReadUnifiedFleetEnabled()
  ) {
    return true;
  }
  if (island === "kv_toll_ledger" && isLedgerReadUnifiedTollEnabled()) return true;
  return false;
}

/** Phase D: Dominion marks retiring islands instead of failing green. */
export function isLedgerPhaseDReconMode(): boolean {
  return envTruthy("LEDGER_PHASE_D_RECON");
}

export function ledgerRetiredIslands(): Set<string> {
  const raw = Deno.env.get("LEDGER_RETIRED_ISLANDS")?.trim();
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}
