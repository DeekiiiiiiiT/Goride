/**
 * RQ-03 (docs/fuel-review-queue-review.md): only one approve or reject may decide a fill.
 *
 * DSH CR-01: the claim never touches the fill's `status` (the Review Queue reads that column),
 * so a claimed fill stays Pending and visible in its tab. The claim lives in
 * payload_json.reviewClaim = { token, at } and is taken with one conditional update on
 * `updated_at` (whoever changed the row first wins; everyone else gets false).
 *
 * DSH CR-02: a claim is only taken over once it is older than CLAIM_STALE_MS, which is longer
 * than an edge function can run (wall-clock limit 400 s), so the first holder is dead by then.
 * The holder re-checks it still owns the claim right before posting and before saving.
 */
import { getServiceClient } from "./service_client.ts";

const TABLE = "fleet_transactions";

/** Longer than any edge function can live, so a stale claim's owner can't still be posting. */
export const CLAIM_STALE_MS = 10 * 60_000;

type ReviewClaim = { token: string; at: string };

function claimOf(payload: unknown): ReviewClaim | null {
  const c = payload && typeof payload === "object" ? (payload as Record<string, unknown>).reviewClaim : null;
  if (!c || typeof c !== "object") return null;
  const { token, at } = c as Record<string, unknown>;
  return typeof token === "string" && typeof at === "string" ? { token, at } : null;
}

/** Pure: may a new claim be taken? (no claim, or the old one is stale) */
export function claimIsFree(payload: unknown, now: Date = new Date()): boolean {
  const c = claimOf(payload);
  if (!c) return true;
  const at = Date.parse(c.at);
  return !Number.isFinite(at) || now.getTime() - at > CLAIM_STALE_MS;
}

async function readRow(id: string): Promise<{ payload: Record<string, unknown>; updatedAt: string } | null> {
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .select("payload_json, updated_at")
    .eq("legacy_kv_id", `transaction:${id}`)
    .maybeSingle();
  if (error) throw new Error(`claim read failed: ${error.message}`);
  if (!data || !data.payload_json || typeof data.payload_json !== "object") return null;
  return { payload: data.payload_json as Record<string, unknown>, updatedAt: String(data.updated_at) };
}

/** Returns this request's claim token, or null when someone else holds the fill. */
export async function claimPendingTransaction(id: string, now: Date = new Date()): Promise<string | null> {
  const row = await readRow(id);
  if (!row) return null;
  if (String(row.payload.status || "").toLowerCase() !== "pending") return null;
  if (!claimIsFree(row.payload, now)) return null;
  const token = crypto.randomUUID();
  const { data, error } = await getServiceClient()
    .from(TABLE)
    .update({ payload_json: { ...row.payload, reviewClaim: { token, at: now.toISOString() } } })
    .eq("legacy_kv_id", `transaction:${id}`)
    .eq("updated_at", row.updatedAt)
    .select("id");
  if (error) throw new Error(`claim failed: ${error.message}`);
  return Array.isArray(data) && data.length === 1 ? token : null;
}

/** CR-02: still ours? Checked right before posting and right before the final save. */
export async function stillHoldsClaim(id: string, token: string): Promise<boolean> {
  const row = await readRow(id);
  return !!row && claimOf(row.payload)?.token === token;
}

/** Give the claim back when the decision did not finish. Only removes our own claim. */
export async function releaseTransactionClaim(id: string, token: string): Promise<void> {
  try {
    const row = await readRow(id);
    if (!row || claimOf(row.payload)?.token !== token) return;
    const next = { ...row.payload };
    delete next.reviewClaim;
    const { error } = await getServiceClient()
      .from(TABLE)
      .update({ payload_json: next })
      .eq("legacy_kv_id", `transaction:${id}`)
      .eq("updated_at", row.updatedAt);
    if (error) console.error("[fuel_review_claim] release failed:", id, error.message);
  } catch (e) {
    // A claim left behind frees itself after CLAIM_STALE_MS and never hides the fill (CR-01).
    console.error("[fuel_review_claim] release failed:", id, e instanceof Error ? e.message : e);
  }
}
