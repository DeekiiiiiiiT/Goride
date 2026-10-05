/** WiPay adapter. Checkout stays the same if the provider file is replaced. */
import { isWipayDemoMode } from "../../_shared/wipayDemo.ts";

export { wipayStatusAccepted as verifyStatus, wipayAmountMatches as verifyAmount, wipayCurrencyOk as verifyCurrency } from "../../_shared/rushMoney/wipayContract.ts";

/** Live checkout must be able to re-check the charge before it starts. */
export function liveStatusConfigured(): boolean {
  const env = (Deno.env.get("WIPAY_ENV") ?? "sandbox").toLowerCase();
  if (isWipayDemoMode() || (env !== "live" && env !== "production")) return true;
  return Boolean(Deno.env.get("WIPAY_STATUS_URL"));
}

export function refundIdempotencyKey(refundKey: string): string {
  return refundKey;
}
