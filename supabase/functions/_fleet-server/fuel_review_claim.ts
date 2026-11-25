/**
 * RQ-03 (docs/fuel-review-queue-review.md): only one approve may post a fill.
 *
 * The claim flips the typed `status` column on fleet.transactions from Pending to Approving
 * in one conditional update. The request that wins posts the fill; every other one gets 409.
 * payload_json is untouched, so readers still see Pending until the winner saves Approved.
 */
import { getServiceClient } from "./service_client.ts";

const TABLE = "fleet_transactions";

/** A claim older than this was left by a request that died; it can be taken again. */
export const CLAIM_STALE_MS = 2 * 60_000;

/** true = this request owns the approve. */
export async function claimPendingTransaction(id: string, now: Date = new Date()): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString();
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .update({ status: "Approving" })
    .eq("legacy_kv_id", `transaction:${id}`)
    .or(`status.eq.Pending,and(status.eq.Approving,updated_at.lt.${staleBefore})`)
    .select("id");
  if (error) throw new Error(`claim failed: ${error.message}`);
  return Array.isArray(data) && data.length === 1;
}

/** Give the claim back when the approve did not finish (the record still says Pending). */
export async function releaseTransactionClaim(id: string): Promise<void> {
  const { error } = await getServiceClient()
    .from(TABLE)
    .update({ status: "Pending" })
    .eq("legacy_kv_id", `transaction:${id}`)
    .eq("status", "Approving");
  if (error) console.error("[fuel_review_claim] release failed:", id, error.message);
}
