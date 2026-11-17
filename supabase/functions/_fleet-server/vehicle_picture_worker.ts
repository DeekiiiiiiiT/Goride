import type { R2Client } from "../_shared/objectStorage/r2Client.ts";
import { checkProviderGuards, ProviderBlockedError } from "./api_usage_logger.ts";
import { cleanLastError } from "../_shared/vehiclePictures/lastError.ts";
import type { ImagenCaller } from "./vehicle_picture_imagen.ts";
import { IMAGEN_TIMEOUT_MS } from "./vehicle_picture_imagen.ts";
import type { VehiclePictureDb } from "./vehicle_picture_db.ts";
import type { VehiclePictureRow } from "./vehicle_picture_types.ts";
import { buildPicturePrompt } from "../_shared/vehiclePictures/prompt.ts";
import type { VehicleLook } from "../_shared/vehiclePictures/lookKey.ts";
import type { VehicleColor } from "../_shared/vehiclePictures/color.ts";
import {
  bumpOutageStreak,
  clearedOutageStreak,
  isPicturesPaused,
  loadVehiclePicturesSettings,
  saveVehiclePicturesSettings,
  type VehiclePicturesSettingsKv,
} from "./vehicle_pictures_settings.ts";
import { classifyPictureGenerationError } from "./vehicle_picture_errors.ts";
import { jamaicaFirstOfNextMonth } from "./vehicle_picture_status.ts";
import { runVehiclePictureCleanup } from "./vehicle_picture_cleanup.ts";

export type WorkerDeps = {
  now: () => Date;
  loadSettings: () => ReturnType<typeof loadVehiclePicturesSettings>;
  saveSettings?: (patch: Partial<VehiclePicturesSettingsKv>) => Promise<void>;
  db: VehiclePictureDb;
  imagen: ImagenCaller;
  r2: R2Client | null;
  randomJitterSec: () => number;
  checkGuards?: () => Promise<void>;
};

export type WorkerResult = { skipped: boolean; processed?: number };

export const ROW_CLAIM_LEASE_MS = 3 * 60 * 1000;
const RUN_BUDGET_MS = 90_000;
const LEASE_SECONDS = 120;
const MIN_LEASE_REMAINING_MS = 60_000;
const MAX_PER_ROUND = 5;
const MAX_REMAKE_PER_ROUND = 2;
const CONTENT_REFUSAL_MSG = "The picture service refused this car";
const KEY_PAUSE_MS = 60 * 60 * 1000;
const OUTAGE_PAUSE_MS = 30 * 60 * 1000;
const BUDGET_RETRY_MS = 60 * 60 * 1000;

type RowResult = { processed: boolean; stopRun: boolean };

export function vehicleLookFromPictureRow(row: VehiclePictureRow): VehicleLook {
  const stage = row.facelift_stage;
  const faceliftStage =
    stage === "pre_facelift" || stage === "facelift" || stage === "standard"
      ? stage
      : "standard";
  return {
    key: row.look_key,
    make: row.make,
    model: row.model,
    generation: row.generation,
    bodyType: row.body_type,
    faceliftStage,
    startYear: row.start_year,
    endYear: row.end_year,
    color: row.color as VehicleColor,
  };
}

export async function runVehiclePictureWorker(deps: WorkerDeps): Promise<WorkerResult> {
  const runId = crypto.randomUUID();
  const started = deps.now().getTime();
  const heldUntil = new Date(started + LEASE_SECONDS * 1000).toISOString();
  const saveSettings = deps.saveSettings ?? saveVehiclePicturesSettings;

  const got = await deps.db.tryAcquireWorkerLease(runId, heldUntil);
  if (!got) return { skipped: true };

  let processed = 0;
  try {
    await deps.db.sweepStuck();
    const settings = await deps.loadSettings();

    let mayClaim = settings.ai_vehicle_pictures === true && !isPicturesPaused(settings, deps.now());

    if (mayClaim) {
      try {
        await (deps.checkGuards ?? (() => checkProviderGuards("gemini")))();
      } catch (e) {
        if (e instanceof ProviderBlockedError) {
          mayClaim = false;
        } else {
          throw e;
        }
      }
    }

    if (!mayClaim) return { skipped: false, processed: 0 };

  SettingsLoop:
    while (deps.now().getTime() - started < RUN_BUDGET_MS) {
      const liveSettings = await deps.loadSettings();
      if (isPicturesPaused(liveSettings, deps.now())) break;

      const rowClaimLeaseIso = () =>
        new Date(deps.now().getTime() + ROW_CLAIM_LEASE_MS).toISOString();

      const live = await deps.db.claimQueuedRows("live", MAX_PER_ROUND, rowClaimLeaseIso());
      const spare = Math.max(0, MAX_PER_ROUND - live.length);
      const remakeLimit = Math.min(MAX_REMAKE_PER_ROUND, spare);
      const remake = remakeLimit > 0
        ? await deps.db.claimQueuedRows("remake", remakeLimit, rowClaimLeaseIso())
        : [];
      const batch = [...live, ...remake];
      if (!batch.length) break;

      const runnable: VehiclePictureRow[] = [];
      for (const row of batch) {
        const leaseEnd = row.lease_until ? Date.parse(row.lease_until) : 0;
        if (leaseEnd - deps.now().getTime() > MIN_LEASE_REMAINING_MS) {
          runnable.push(row);
        } else {
          await deps.db.releaseClaimedToQueued(row.id);
        }
      }

      if (!runnable.length) break;

      for (const row of runnable) {
        const freshSettings = await deps.loadSettings();
        if (isPicturesPaused(freshSettings, deps.now())) break SettingsLoop;

        const result = await processOneRow(deps, freshSettings, row, saveSettings);
        if (result.processed) processed += 1;
        if (result.stopRun) {
          const idx = runnable.indexOf(row);
          for (let j = idx + 1; j < runnable.length; j++) {
            await deps.db.releaseClaimedToQueued(runnable[j]!.id);
          }
          break SettingsLoop;
        }
      }

      if (deps.now().getTime() - started >= RUN_BUDGET_MS) break;
    }

    return { skipped: false, processed };
  } finally {
    const settings = await deps.loadSettings().catch(() => null);
    if (settings) {
      await runVehiclePictureCleanup({
        db: deps.db,
        r2: deps.r2,
        retentionDays: settings.vehicle_picture_retention_days ?? 30,
        now: deps.now(),
        loadSettings: deps.loadSettings,
        saveSettings,
      });
    }
    await deps.db.releaseWorkerLease(runId);
  }
}

async function processOneRow(
  deps: WorkerDeps,
  settings: Awaited<ReturnType<typeof loadVehiclePicturesSettings>>,
  row: VehiclePictureRow,
  saveSettings: (patch: Partial<VehiclePicturesSettingsKv>) => Promise<void>,
): Promise<RowResult> {
  const built = vehicleLookFromPictureRow(row);

  try {
    await (deps.checkGuards ?? (() => checkProviderGuards("gemini")))();
  } catch (e) {
    if (e instanceof ProviderBlockedError) {
      const retryAt = new Date(deps.now().getTime() + BUDGET_RETRY_MS).toISOString();
      if (row.lane === "remake") {
        await deps.db.deferAllRemakeRows(jamaicaFirstOfNextMonth(deps.now()).toISOString());
        return { processed: false, stopRun: true };
      }
      await deps.db.requeuePicture(row.id, retryAt);
      return { processed: false, stopRun: false };
    }
    throw e;
  }

  const attemptsAfter = await deps.db.incrementAttempts(row.id);

  try {
    const model = settings.vehicle_picture_model;
    const { pngBytes, imageExt, imageContentType, costUsd, prompt, promptVersion } = await deps.imagen({
      model,
      look: built,
      timeoutMs: IMAGEN_TIMEOUT_MS,
    });

    if (!deps.r2) throw new Error("R2 not configured");
    const version = row.version;
    const r2Key = `catalogue/images/${row.id}/v${version}.${imageExt}`;
    await deps.r2.put("public", r2Key, pngBytes, imageContentType, "public, max-age=31536000, immutable");

    await deps.db.becomeReady({
      pictureId: row.id,
      version,
      r2Key,
      costUsd,
      provider: "gemini",
      aiModel: model,
      promptVersion,
      prompt: prompt || buildPicturePrompt(built),
      source: "ai",
    });

    await saveSettings({ vehicle_picture_outage_streak: clearedOutageStreak() });
    return { processed: true, stopRun: false };
  } catch (e) {
    if (e instanceof ProviderBlockedError) {
      const retryAt = new Date(deps.now().getTime() + BUDGET_RETRY_MS).toISOString();
      if (row.lane === "remake") {
        await deps.db.deferAllRemakeRows(jamaicaFirstOfNextMonth(deps.now()).toISOString());
        return { processed: false, stopRun: true };
      }
      await deps.db.requeueGiveBackAttempt(row.id, retryAt);
      return { processed: false, stopRun: false };
    }

    const failureClass = classifyPictureGenerationError(e);
    const max = settings.vehicle_picture_max_attempts ?? 3;

    if (failureClass === "content") {
      await deps.db.failPicture(row.id, cleanLastError(CONTENT_REFUSAL_MSG));
      return { processed: false, stopRun: false };
    }

    if (failureClass === "key") {
      const until = new Date(deps.now().getTime() + KEY_PAUSE_MS).toISOString();
      await saveSettings({
        vehicle_pictures_paused_until: until,
        vehicle_pictures_pause_reason: "key",
      });
      await deps.db.requeueGiveBackAttempt(row.id);
      return { processed: false, stopRun: true };
    }

    const attempts = attemptsAfter;
    if (attempts >= max) {
      await deps.db.failPicture(row.id, cleanLastError(e instanceof Error ? e.message : "Generation failed"));
    } else {
      const backoffMin = Math.pow(2, attempts);
      const jitter = deps.randomJitterSec();
      const next = new Date(deps.now().getTime() + (backoffMin * 60 + jitter) * 1000);
      await deps.db.requeuePicture(row.id, next.toISOString());
    }

    const { streak, tripBreaker } = bumpOutageStreak(
      settings.vehicle_picture_outage_streak as { count: number; firstAt: string } | undefined,
      deps.now(),
    );
    await saveSettings({ vehicle_picture_outage_streak: streak });

    if (tripBreaker) {
      const until = new Date(deps.now().getTime() + OUTAGE_PAUSE_MS).toISOString();
      await saveSettings({
        vehicle_pictures_paused_until: until,
        vehicle_pictures_pause_reason: "outage",
        vehicle_picture_outage_streak: clearedOutageStreak(),
      });
      return { processed: false, stopRun: true };
    }

    return { processed: false, stopRun: false };
  }
}