/** Server flag for cash settlement (`CASH_SETTLEMENT_ENABLED=1`). Default OFF when unset. */
export function isCashSettlementEnabled(): boolean {
  return Deno.env.get("CASH_SETTLEMENT_ENABLED") === "1";
}
