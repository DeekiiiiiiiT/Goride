/**
 * Server-side gate: merchants cannot enable accepting orders until payout is verified
 * (or the store is flagged as a test merchant).
 */

export type MerchantPayoutGateRow = {
  is_accepting_orders?: boolean | null;
  payout_ready?: boolean | null;
  is_test_merchant?: boolean | null;
};

export type PayoutGateOptions = {
  adminBypass?: boolean;
};

export const PAYOUT_NOT_READY_CODE = "payout_not_ready";

export function canEnableAcceptingOrders(
  merchant: MerchantPayoutGateRow,
  nextAccepting: boolean,
  opts: PayoutGateOptions = {},
): boolean {
  if (opts.adminBypass) return true;
  if (!nextAccepting) return true;
  if (merchant.is_accepting_orders === true) return true;
  if (merchant.is_test_merchant === true) return true;
  if (merchant.payout_ready === true) return true;
  return false;
}

export function payoutGateError(): { error: string; code: string } {
  return {
    error: "Payout setup must be verified before accepting orders",
    code: PAYOUT_NOT_READY_CODE,
  };
}

export function assertCanEnableAcceptingOrders(
  merchant: MerchantPayoutGateRow,
  nextAccepting: boolean,
  opts: PayoutGateOptions = {},
): { ok: true } | { ok: false; status: 403; body: { error: string; code: string } } {
  if (canEnableAcceptingOrders(merchant, nextAccepting, opts)) {
    return { ok: true };
  }
  return { ok: false, status: 403, body: payoutGateError() };
}
