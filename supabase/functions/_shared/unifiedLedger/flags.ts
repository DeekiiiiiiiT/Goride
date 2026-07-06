/** Unified ledger feature flags (Phases 7–12). */

export function isLedgerDualWriteEnabled(): boolean {
  const v = Deno.env.get("LEDGER_DUAL_WRITE_ENABLED");
  return v === "1" || v === "true" || v === "yes";
}

export function isLedgerReadUnifiedEnabled(): boolean {
  const v = Deno.env.get("LEDGER_READ_UNIFIED");
  return v === "1" || v === "true" || v === "yes";
}
