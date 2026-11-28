/**
 * The part-picture worker (docs/part-pictures-audit.md §3.3), a copy of vehicle_picture_worker.ts:
 * one run at a time, rounds of 5, a 90 s budget, retries with a lease, and every state change through the D1
 * functions. One Gemini call per row, with the diagram(s) as image input.
 *
 * Honours: the switch (ai_part_pictures), daily_max, the pause fields, and the shared Gemini budget cap.
 * A budget block or a refused key gives the attempt back (the call never happened).
 */
import { checkProviderGuards, ProviderBlockedError } from "./api_usage_logger.ts";
import { cleanLastError } from "../_shared/vehiclePictures/lastError.ts";
import { classifyPictureGenerationError } from "./vehicle_picture_errors.ts";
import { buildPartPicturePrompt } from "./part_picture_prompt.ts";
import {
  isPartPicturesPaused,
  partPictureDay,
  type PartPicturesSettings,
  type PartPicturesSettingsKv,
} from "./part_pictures_settings.ts";
import type { PartPictureDb, PartPictureRow } from "./part_picture_db.ts";
import type { PartPictureCaller, PartPictureImageInput } from "./part_picture_imagen.ts";
import { PART_PICTURE_TIMEOUT_MS } from "./part_picture_imagen.ts";
import { runPartPictureCleanup } from "./part_picture_cleanup.ts";

/** The R2 surface the worker uses (R2Client satisfies it; tests pass a fake). */
export type PartObjectStore = {
  read(bucket: "public" | "private", key: string): Promise<Uint8Array>;
  put(
    bucket: "public" | "private",
    key: string,
    bytes: Uint8Array,
    contentType: string,
    cacheControl: string,
  ): Promise<void>;
  remove(bucket: "public" | "private", keys: string[]): Promise<void>;
};

export type PartWorkerDeps = {
  now: () => Date;
  loadSettings: () => Promise<PartPicturesSettings>;
  saveSettings?: (patch: Partial<PartPicturesSettingsKv>) => Promise<void>;
  db: PartPictureDb;
  imagen: PartPictureCaller;
  r2: PartObjectStore | null;
  checkGuards?: () => Promise<void>;
};

export type PartWorkerResult = {
  skipped: boolean;
  processed?: number;
  /** Plain reason the run stopped early (budget, key, switch), for the route's answer. */
  stopped?: string | null;
};

/** A claimed row is held for this long; a crash hands it back through the sweep. */
export const PART_ROW_LEASE_SECONDS = 3 * 60;
const RUN_BUDGET_MS = 90_000;
/** One call can take up to 50 s, so a row is only started with this much of the run budget left. */
const MIN_ROW_TIME_MS = 60_000;
const WORKER_LEASE_SECONDS = 120;
const MAX_PER_ROUND = 5;
const KEY_PAUSE_MS = 60 * 60 * 1000;
const BUDGET_RETRY_MS = 60 * 60 * 1000;
/** A group switched off after queueing waits an hour, then looks again. No attempt is used. */
const TEMPLATE_OFF_RETRY_MS = 60 * 60 * 1000;
const MAX_DIAGRAMS = 3;
const CONTENT_REFUSAL_MSG = "The picture service refused this part";
const NO_DIAGRAM_MSG = "The diagram is gone. Upload the page again as a single file.";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Content type from a stored key's extension (the bytes are already known to be that picture). */
export function contentTypeForKey(key: string): string {
  const ext = String(key ?? "").split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

type RowResult = { processed: boolean; stopRun: boolean; stopped?: string };

export async function runPartPictureWorker(deps: PartWorkerDeps): Promise<PartWorkerResult> {
  const runId = crypto.randomUUID();
  const started = deps.now().getTime();
  const heldUntil = new Date(started + WORKER_LEASE_SECONDS * 1000).toISOString();
  const checkGuards = deps.checkGuards ?? (() => checkProviderGuards("gemini"));

  const got = await deps.db.tryAcquireWorkerLease(runId, heldUntil);
  if (!got) return { skipped: true };

  let processed = 0;
  let stopped: string | null = null;
  try {
    await deps.db.sweepStuck();
    const settings = await deps.loadSettings();

    let mayClaim = settings.ai_part_pictures === true && !isPartPicturesPaused(settings, deps.now());
    if (!mayClaim) {
      return { skipped: false, processed: 0, stopped: settings.ai_part_pictures !== true ? "off" : "paused" };
    }

    try {
      await checkGuards();
    } catch (err) {
      if (err instanceof ProviderBlockedError) {
        return { skipped: false, processed: 0, stopped: "budget" };
      }
      throw err;
    }

    while (deps.now().getTime() - started < RUN_BUDGET_MS) {
      const live = await deps.loadSettings();
      if (live.ai_part_pictures !== true) {
        stopped = "off";
        break;
      }
      if (isPartPicturesPaused(live, deps.now())) {
        stopped = "paused";
        break;
      }

      const madeToday = await deps.db.countMadeOn(partPictureDay(deps.now()));
      // daily_max is a hard ceiling for the Jamaica calendar day; a round never claims past it.
      const room = live.daily_max > 0 ? live.daily_max - madeToday : MAX_PER_ROUND;
      if (room <= 0) {
        stopped = "daily_max";
        break;
      }

      const rows = await deps.db.claimRows(Math.min(MAX_PER_ROUND, room), PART_ROW_LEASE_SECONDS);
      if (!rows.length) break;

      let stop = false;
      let outOfTime = false;
      for (let i = 0; i < rows.length; i++) {
        // §3.3 time guard: never start a call that could outrun the run's budget. A row not started goes back
        // to queued without using an attempt, because no call was made.
        const left = RUN_BUDGET_MS - (deps.now().getTime() - started);
        if (stop || outOfTime || left < MIN_ROW_TIME_MS) {
          if (left < MIN_ROW_TIME_MS) outOfTime = true;
          await deps.db.requeue(rows[i].id, deps.now().toISOString());
          continue;
        }
        const result = await processOneRow(deps, live, rows[i]);
        if (result.processed) processed += 1;
        if (result.stopRun) {
          stop = true;
          stopped = result.stopped ?? stopped;
        }
      }
      if (outOfTime && !stopped) stopped = "time";
      if (stop || outOfTime) break;
      if (deps.now().getTime() - started >= RUN_BUDGET_MS) break;
    }

    return { skipped: false, processed, stopped };
  } finally {
    const settings = await deps.loadSettings().catch(() => null);
    if (settings) {
      await runPartPictureCleanup({
        db: deps.db,
        r2: deps.r2,
        retentionDays: settings.retention_days,
        now: deps.now(),
        loadSettings: deps.loadSettings,
        saveSettings: deps.saveSettings,
      });
    }
    await deps.db.releaseWorkerLease(runId);
  }
}

async function processOneRow(
  deps: PartWorkerDeps,
  settings: PartPicturesSettings,
  row: PartPictureRow,
): Promise<RowResult> {
  const now = deps.now();
  const checkGuards = deps.checkGuards ?? (() => checkProviderGuards("gemini"));

  // The budget can fall over between the run's first check and this row.
  try {
    await checkGuards();
  } catch (err) {
    if (err instanceof ProviderBlockedError) {
      await deps.db.requeueGiveBackAttempt(row.id, new Date(now.getTime() + BUDGET_RETRY_MS).toISOString());
      return { processed: false, stopRun: true, stopped: "budget" };
    }
    throw err;
  }

  const template = row.catalog_group_id ? await deps.db.loadTemplate(row.catalog_group_id) : null;
  if (template && template.enabled === false) {
    await deps.db.requeue(row.id, new Date(now.getTime() + TEMPLATE_OFF_RETRY_MS).toISOString());
    return { processed: false, stopRun: false };
  }

  // The diagram is what the model looks at. Gone for good (cleanup, or a cascaded delete) is not a retry.
  const diagrams = await deps.db.listDiagrams(row.id);
  if (!diagrams.length) {
    await deps.db.fail(row.id, NO_DIAGRAM_MSG);
    return { processed: false, stopRun: false };
  }

  const images: PartPictureImageInput[] = [];
  for (const diagram of diagrams.slice(0, MAX_DIAGRAMS)) {
    try {
      images.push({
        contentType: contentTypeForKey(diagram.r2_key),
        bytes: await readDiagram(deps, diagram.r2_key),
      });
    } catch (err) {
      // A transient R2 problem: try again later without using an attempt.
      console.error("part picture diagram unreadable", err);
      await deps.db.requeueGiveBackAttempt(row.id, new Date(now.getTime() + BUDGET_RETRY_MS).toISOString());
      return { processed: false, stopRun: false };
    }
  }
  if (!images.length) {
    await deps.db.requeueGiveBackAttempt(row.id, new Date(now.getTime() + BUDGET_RETRY_MS).toISOString());
    return { processed: false, stopRun: false };
  }

  const attemptsAfter = await deps.db.incrementAttempts(row.id);
  const prompt = buildPartPicturePrompt({
    label: row.label,
    partName: row.part_name,
    materials: template?.materials ?? "",
  });

  try {
    const result = await deps.imagen({
      model: settings.part_picture_model,
      prompt,
      images,
      timeoutMs: PART_PICTURE_TIMEOUT_MS,
    });

    if (!deps.r2) throw new Error("R2 not configured");
    const r2Key = `catalogue/parts/${row.id}/v${row.version}.${result.imageExt}`;
    await deps.r2.put("public", r2Key, result.bytes, result.imageContentType, "public, max-age=31536000, immutable");

    await deps.db.becomeReady({
      pictureId: row.id,
      version: row.version,
      r2Key,
      costUsd: result.costUsd,
      aiModel: settings.part_picture_model,
      templateVersion: template?.version ?? row.template_version,
      prompt,
    });
    return { processed: true, stopRun: false };
  } catch (err) {
    if (err instanceof ProviderBlockedError) {
      await deps.db.requeueGiveBackAttempt(row.id, new Date(deps.now().getTime() + BUDGET_RETRY_MS).toISOString());
      return { processed: false, stopRun: true, stopped: "budget" };
    }

    const failureClass = classifyPictureGenerationError(err);

    if (failureClass === "content") {
      await deps.db.fail(row.id, CONTENT_REFUSAL_MSG);
      return { processed: false, stopRun: false };
    }

    if (failureClass === "key") {
      const until = new Date(deps.now().getTime() + KEY_PAUSE_MS).toISOString();
      if (deps.saveSettings) {
        await deps.saveSettings({ part_pictures_paused_until: until, part_pictures_pause_reason: "key" });
      }
      await deps.db.requeueGiveBackAttempt(row.id, new Date(deps.now().getTime() + KEY_PAUSE_MS).toISOString());
      return { processed: false, stopRun: true, stopped: "key" };
    }

    const max = settings.max_attempts ?? 3;
    const message = cleanLastError(err instanceof Error ? err.message : "Generation failed");
    if (attemptsAfter >= max) {
      await deps.db.fail(row.id, message);
      return { processed: false, stopRun: false };
    }
    // max_attempts counts Gemini calls in total: retry after 2 min, then 4 min, then failed (same as the car).
    const backoffMin = Math.pow(2, attemptsAfter);
    await deps.db.requeue(row.id, new Date(deps.now().getTime() + backoffMin * 60_000).toISOString());
    return { processed: false, stopRun: false };
  }
}

async function readDiagram(deps: PartWorkerDeps, key: string): Promise<Uint8Array> {
  if (!deps.r2) throw new Error("R2 not configured");
  return await deps.r2.read("private", key);
}
