import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { riderAccountKeyForUser } from "./buildJournalEntries.ts";
import {
  getAccountByKey,
  walletBalanceFromMinor,
} from "../../_shared/paymentAccounts.ts";

export async function getRiderWalletAvailableMinor(
  db: SupabaseClient | undefined,
  riderUserId: string,
  currency: string,
): Promise<number> {
  const key = riderAccountKeyForUser(riderUserId);
  const account = await getAccountByKey(db, key, currency);
  if (!account) return 0;
  return walletBalanceFromMinor(account.balance_minor, currency).available_minor;
}
