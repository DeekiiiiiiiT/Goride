/**
 * Fuel log offline-first — S6 photo reader (docs/fuel-log-offline-first-audit.md).
 *
 * Runs every 10 minutes (fleet-fuel-cron job "photo-read" → POST /fuel/photo-read/run).
 * For each due fill in fleet.fuel_photo_read_queue: open the stored pump photo (and the
 * odometer photo when the fill has no reading), read total / litres / odometer, and write
 * the result onto the fill with applyPhotoRead (ready for review, or Needs a look).
 *
 * Readers are passed in, so the job is tested without network calls.
 */
import {
  applyPhotoRead,
  captureIdOf,
  odometerPhotoUrlOf,
  photoReadAttemptFailed,
  pumpPhotoUrlOf,
  PHOTO_READ_WAITING,
  type PhotoReadResult,
} from "./fuel_offline_fill.ts";

type Rec = Record<string, unknown>;

export interface PhotoReaderDeps {
  claim: (limit: number) => Promise<Array<{ transaction_id: string; organization_id: string | null; attempts: number }>>;
  finish: (id: string, outcome: "read" | "needs_look" | "gone" | null, lastError: string | null, retryAt: string | null) => Promise<void>;
  loadFill: (id: string) => Promise<Rec | null>;
  saveFill: (fill: Rec) => Promise<void>;
  /** Photo bytes as a data URL (data:image/jpeg;base64,...). Throws when it can't be opened. */
  openPhoto: (url: string) => Promise<string>;
  readPump: (dataUrl: string) => Promise<{ amount: number | null; liters: number | null; odometer: number | null }>;
  readOdometer: (dataUrl: string) => Promise<number | null>;
  now: () => Date;
}

export interface PhotoReaderRun {
  claimed: number;
  read: number;
  needsLook: number;
  retry: number;
  gone: number;
}

const RETRY_MINUTES = [10, 30, 120];

export async function runFuelPhotoReader(deps: PhotoReaderDeps, limit = 5): Promise<PhotoReaderRun> {
  const out: PhotoReaderRun = { claimed: 0, read: 0, needsLook: 0, retry: 0, gone: 0 };
  const due = await deps.claim(limit);
  out.claimed = due.length;

  for (const job of due) {
    const nowIso = deps.now().toISOString();
    const fill = await deps.loadFill(job.transaction_id);
    const status = String((fill?.metadata as Rec | undefined)?.photoReadStatus ?? "");
    // Deleted, already finished, or someone typed the numbers in meanwhile: nothing to read.
    if (!fill || !captureIdOf(fill) || status !== PHOTO_READ_WAITING) {
      await deps.finish(job.transaction_id, "gone", null, null);
      out.gone++;
      continue;
    }

    const pumpUrl = pumpPhotoUrlOf(fill);
    if (!pumpUrl) {
      const failed = photoReadAttemptFailed(fill, "No pump photo on this fill", 99, nowIso);
      await deps.saveFill(failed.tx);
      await deps.finish(job.transaction_id, "needs_look", "no pump photo", null);
      out.needsLook++;
      continue;
    }

    try {
      const pump = await deps.readPump(await deps.openPhoto(pumpUrl));
      let odometer = pump.odometer;
      const hasReading = Number(fill.odometer) > 0;
      const odoUrl = odometerPhotoUrlOf(fill);
      if (!hasReading && odoUrl) {
        try {
          odometer = await deps.readOdometer(await deps.openPhoto(odoUrl));
        } catch {
          // The pump numbers are still useful; the owner sees the odometer missing.
        }
      }
      const read: PhotoReadResult = { amount: pump.amount, liters: pump.liters, odometer };
      const next = applyPhotoRead(fill, read, nowIso);
      await deps.saveFill(next);
      const outcome = (next.metadata as Rec).photoReadStatus === "read" ? "read" : "needs_look";
      await deps.finish(job.transaction_id, outcome, null, null);
      if (outcome === "read") out.read++;
      else out.needsLook++;
    } catch (e) {
      const reason = "Couldn't read the photos";
      const detail = e instanceof Error ? e.message : String(e);
      const failed = photoReadAttemptFailed(fill, reason, job.attempts, nowIso);
      await deps.saveFill(failed.tx);
      if (failed.giveUp) {
        await deps.finish(job.transaction_id, "needs_look", detail, null);
        out.needsLook++;
      } else {
        const minutes = RETRY_MINUTES[Math.min(job.attempts - 1, RETRY_MINUTES.length - 1)] ?? 30;
        const retryAt = new Date(deps.now().getTime() + minutes * 60_000).toISOString();
        await deps.finish(job.transaction_id, null, detail, retryAt);
        out.retry++;
      }
    }
  }
  return out;
}

/** Bytes → data URL without blowing the call stack on big photos. */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return `data:${mime || "image/jpeg"};base64,${btoa(binary)}`;
}
