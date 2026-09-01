/**
 * Ensure KV synthetic import batch exists for live Rush projection.
 */
import { rushLiveSyncBatchId, RUSH_PLATFORM, weekStartYmdFromIso } from "./rushBatchIds.ts";

export { rushLiveSyncBatchId, weekStartYmdFromIso, RUSH_PLATFORM };

export type SyncOrderResult = { ok: true } | { ok: false; reason: string };

export async function ensureRushSyntheticBatch(
  orgId: string,
  eventIso: string,
): Promise<string> {
  const weekStart = weekStartYmdFromIso(eventIso);
  const batchId = rushLiveSyncBatchId(orgId, eventIso);
  const kv = await import("../_fleet-server/kv_store.tsx");
  const existing = await kv.get(`batch:${batchId}`);
  if (existing) return batchId;

  const batch = {
    id: batchId,
    organizationId: orgId,
    platform: RUSH_PLATFORM,
    type: "live_sync",
    status: "completed",
    uploadDate: new Date().toISOString(),
    recordCount: 0,
    dataPeriodStart: weekStart,
    dataPeriodEnd: weekStart,
    notes: "Auto-created live Rush delivery sync batch",
    isSynthetic: true,
  };
  await kv.set(`batch:${batchId}`, batch);
  return batchId;
}
