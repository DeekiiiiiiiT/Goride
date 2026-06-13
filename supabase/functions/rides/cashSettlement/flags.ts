/** Server flag for cash settlement (`CASH_SETTLEMENT_ENABLED=1`). Default OFF when unset. */
export function isCashSettlementEnabled(): boolean {
  return Deno.env.get("CASH_SETTLEMENT_ENABLED") === "1";
}

/** Multi-wallet settlement (`CASH_SETTLEMENT_V2=1`). Requires V1 flag. Default OFF. */
export function isCashSettlementV2Enabled(): boolean {
  return isCashSettlementEnabled() && Deno.env.get("CASH_SETTLEMENT_V2") === "1";
}

/** Optional dispatch guard when driver open debt exceeds threshold. Default OFF. */
export function isDriverDebtDispatchGuardEnabled(): boolean {
  return isCashSettlementV2Enabled() &&
    Deno.env.get("CASH_SETTLEMENT_DEBT_DISPATCH_GUARD") === "1";
}

export function driverDebtDispatchThresholdMinor(): number {
  const raw = Number(Deno.env.get("CASH_SETTLEMENT_DEBT_THRESHOLD_MINOR"));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 50_000;
}
