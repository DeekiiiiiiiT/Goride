/**
 * Part-picture file cleanup (§3.3): old version files and diagrams past their 30 days go from R2, then the row is
 * marked. Same shape as vehicle_picture_cleanup.ts: at most 50 deletes, at most once every 10 minutes, and a file is
 * only marked deleted after R2 confirms.
 */
import type { PartPictureCleanupCandidate, PartPictureDb } from "./part_picture_db.ts";
import type { PartObjectStore } from "./part_picture_worker.ts";
import type { PartPicturesSettingsKv } from "./part_pictures_settings.ts";

const MAX_DELETES_PER_RUN = 50;
const CLEANUP_MIN_INTERVAL_MS = 10 * 60 * 1000;

export type CleanupResult = { versions: number; diagrams: number };

export async function runPartPictureCleanup(opts: {
  db: PartPictureDb;
  r2: PartObjectStore | null;
  retentionDays: number;
  now: Date;
  loadSettings?: () => Promise<PartPicturesSettingsKv>;
  saveSettings?: (patch: Partial<PartPicturesSettingsKv>) => Promise<void>;
}): Promise<CleanupResult> {
  const { db, r2, retentionDays, now } = opts;
  const result: CleanupResult = { versions: 0, diagrams: 0 };
  if (!r2) return result;

  if (opts.loadSettings) {
    const settings = await opts.loadSettings();
    const lastRun = settings.part_picture_cleanup_last_run_at;
    if (lastRun) {
      const elapsed = now.getTime() - Date.parse(lastRun);
      if (Number.isFinite(elapsed) && elapsed < CLEANUP_MIN_INTERVAL_MS) return result;
    }
  }

  let candidates: PartPictureCleanupCandidate[] = [];
  try {
    candidates = await db.cleanupCandidates(retentionDays, MAX_DELETES_PER_RUN);
  } catch (err) {
    console.error("part picture cleanup candidates failed", err);
    return result;
  }

  const deletedAtIso = now.toISOString();
  for (const row of candidates) {
    try {
      if (row.kind === "diagram") {
        await r2.remove("private", [row.r2Key]);
        await db.markDiagramDeleted(row.refId, deletedAtIso);
        result.diagrams += 1;
      } else {
        await r2.remove("public", [row.r2Key]);
        await db.markVersionFileDeleted(row.refId, deletedAtIso);
        result.versions += 1;
      }
    } catch {
      // Leave the row unmarked: the next run tries again.
    }
  }

  if (opts.saveSettings) {
    await opts.saveSettings({ part_picture_cleanup_last_run_at: now.toISOString() });
  }
  return result;
}
