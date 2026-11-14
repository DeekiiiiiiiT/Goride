/**
 * Claims are plain records: save (upsert) and delete. Nothing else happens on save.
 *
 * Claims used to be the old toll system's dispute / "Charge Driver" flow: each claim was linked to a toll_ledger row,
 * and resolving it posted a driver charge and moved the toll's workflow stage. That flow is removed with the old toll
 * system (docs/toll-old-system-removal-audit.md S2); who pays a toll is decided in the new toll system only.
 * Money already posted by old claims stays in the books.
 */
import * as kv from "./kv_store.tsx";
import { stampOrg } from "./org_scope.ts";

/** Save the full claim object (id and createdAt filled in when missing). */
export async function upsertClaim(claimInput: Record<string, unknown>, c: unknown): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  const claim: Record<string, unknown> = {
    ...claimInput,
    id: claimInput.id ? String(claimInput.id) : crypto.randomUUID(),
    createdAt: claimInput.createdAt ?? now,
    updatedAt: now,
  };
  const stamped = stampOrg(claim, c as never);
  await kv.set(`claim:${stamped.id}`, stamped);
  return stamped;
}

export async function deleteClaim(claimId: string): Promise<void> {
  await kv.del(`claim:${claimId}`);
}
