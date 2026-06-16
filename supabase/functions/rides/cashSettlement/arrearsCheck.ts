import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { riderAccountKeyForUser } from "./buildJournalEntries.ts";
import {
  getAccountByKey,
  walletBalanceFromMinor,
} from "../../_shared/paymentAccounts.ts";
import { isCashSettlementArrearsBlockEnabled } from "./flags.ts";

export interface RiderArrearsCheckResult {
  blocked: boolean;
  arrearsMinor: number;
}

/**
 * Get the rider's current arrears amount in minor units.
 * Returns 0 if no arrears exist or if the account doesn't exist.
 */
export async function getRiderArrearsMinor(
  db: SupabaseClient | undefined,
  riderUserId: string,
  currency: string,
): Promise<number> {
  const key = riderAccountKeyForUser(riderUserId);
  const account = await getAccountByKey(db, key, currency);
  if (!account) return 0;
  return walletBalanceFromMinor(account.balance_minor, currency).arrears_minor;
}

/**
 * Check if a rider should be blocked from requesting a cash ride due to arrears.
 * 
 * Returns { blocked: false } if:
 * - Feature flag is disabled
 * - Payment method is not 'cash'
 * - Rider has no arrears (balance >= 0)
 * 
 * Returns { blocked: true, arrearsMinor: X } if:
 * - Feature flag is enabled
 * - Payment method is 'cash'
 * - Rider has outstanding arrears (balance < 0)
 */
export async function isRiderArrearsBlocked(
  db: SupabaseClient | undefined,
  riderUserId: string,
  paymentMethod: string,
  currency: string,
): Promise<RiderArrearsCheckResult> {
  if (!isCashSettlementArrearsBlockEnabled()) {
    return { blocked: false, arrearsMinor: 0 };
  }

  if (paymentMethod !== "cash") {
    return { blocked: false, arrearsMinor: 0 };
  }

  const arrearsMinor = await getRiderArrearsMinor(db, riderUserId, currency);
  
  if (arrearsMinor > 0) {
    return { blocked: true, arrearsMinor };
  }

  return { blocked: false, arrearsMinor: 0 };
}
