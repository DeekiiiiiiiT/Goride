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

/**
 * Cash + rider wallet split settlement (`CASH_SETTLEMENT_SPLIT_PAYMENT=1`).
 * Requires V2. When OFF, legacy underpay path is unchanged.
 */
export function isCashSettlementSplitPaymentEnabled(): boolean {
  return isCashSettlementV2Enabled() &&
    Deno.env.get("CASH_SETTLEMENT_SPLIT_PAYMENT") === "1";
}

export function driverDebtDispatchThresholdMinor(): number {
  const raw = Number(Deno.env.get("CASH_SETTLEMENT_DEBT_THRESHOLD_MINOR"));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 50_000;
}

/**
 * Block riders with outstanding arrears from requesting new cash rides.
 * Requires V2. When OFF, riders can book cash rides regardless of arrears.
 */
export function isCashSettlementArrearsBlockEnabled(): boolean {
  return isCashSettlementV2Enabled() &&
    Deno.env.get("CASH_SETTLEMENT_ARREARS_BLOCK") === "1";
}

/**
 * Enable switch-to-card option for riders to pay shortfall via card.
 * Requires V2. When OFF, shortfall becomes arrears only.
 */
export function isCashSettlementSwitchToCardEnabled(): boolean {
  return isCashSettlementV2Enabled() &&
    Deno.env.get("CASH_SETTLEMENT_SWITCH_TO_CARD") === "1";
}

/**
 * Enable rider dispute flow for contested cash settlement amounts.
 * Requires V2. When OFF, disputes are not available.
 */
export function isCashSettlementDisputeFlowEnabled(): boolean {
  return isCashSettlementV2Enabled() &&
    Deno.env.get("CASH_SETTLEMENT_DISPUTE_FLOW") === "1";
}

/**
 * Enable admin settlement override tools (write-off, manual settle, adjustments).
 * Requires V2. When OFF, admin override endpoints return 404.
 */
export function isCashSettlementAdminOverrideEnabled(): boolean {
  return isCashSettlementV2Enabled() &&
    Deno.env.get("CASH_SETTLEMENT_ADMIN_OVERRIDE") === "1";
}
