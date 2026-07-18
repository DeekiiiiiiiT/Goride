/**
 * Deterministic projection-transaction id for driver toll charges.
 *
 * Kept in its own dependency-free module (no KV / supabase-js import) so the
 * race-safety property can be unit-tested in isolation.
 *
 * The KV store (kv_store.tsx) has no set-if-absent / CAS primitive, so two
 * concurrent `emitDriverTollCharge` calls for the same toll could each read
 * "no active marker" and independently create a projection txn under a random
 * UUID — a double charge on the cash-wallet side. Deriving the projection id
 * from the SAME (tollId, version) anchor the ledger already uses makes both
 * racers write the IDENTICAL `transaction:{id}` row, so the KV upsert collapses
 * them into one. This is the optimistic-versioning claim the KV layer cannot
 * enforce natively.
 */
export async function deterministicProjectionTxId(tollId: string, version: number): Promise<string> {
  const seed = `toll_charge_tx:${tollId}:v${version}`;
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)),
  );
  const h = Array.from(digest.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
