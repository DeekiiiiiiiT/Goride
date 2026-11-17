/**
 * Dominion admin API for vehicle pictures (§6). No fleet-identifying fields in responses.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PROMPT_VERSION } from "../_shared/vehiclePictures/prompt.ts";
import { allowRequest } from "../_shared/rateLimit.ts";
import { logAdminAction } from "../_shared/auditLog.ts";
import {
  finishUpload,
  publicMediaUrl,
  startUpload,
  storageDepsFromEnv,
  StorageFlowError,
  type FlowDeps,
} from "../_shared/objectStorage/index.ts";
import { vehiclePictureSrc } from "../../../packages/roam-shared/src/storage/vehiclePicture.ts";
import {
  assertCatalogStaffReadResponse,
  assertCatalogWriteResponse,
  catalogActorId,
} from "./catalog_access.ts";
import {
  hasPlatformOwnerAccess,
  requireAuth,
  type RbacUser,
} from "./rbac_middleware.ts";
import { getBudget, readUsageTotals } from "./api_usage_logger.ts";
import type { Provider } from "./api_pricing.ts";
import { createVehiclePictureDb, type VehiclePictureDb } from "./vehicle_picture_db.ts";
import { R2Client, r2ConfigFromEnv } from "../_shared/objectStorage/r2Client.ts";
import {
  PictureInUseError,
  regeneratePicture,
  removePicture,
  replacePicture,
  restorePrevious,
  UploadTypeNotAllowedError,
} from "./vehicle_picture_versions.ts";
import {
  isPicturesPaused,
  loadVehiclePicturesSettings,
  saveVehiclePicturesSettings,
} from "./vehicle_pictures_settings.ts";
import { kickVehiclePictureWorker } from "./vehicle_picture_kick.ts";
import type { VehiclePictureRow } from "./vehicle_picture_types.ts";

const PAGE_SIZE = 24;
const REGEN_PER_DAY = 30;
const REGEN_WINDOW_MS = 24 * 60 * 60 * 1000;
const PICTURE_UNIT_COST = 0.04;
const REMAKE_HOUR_RATE = 120;

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  delete: (path: string, ...handlers: unknown[]) => void;
};

let storageDepsOverride: FlowDeps | null = null;
let auditOverride: typeof logAdminAction | null = null;
let allowRegenOverride: ((userId: string) => Promise<boolean>) | null = null;
let dbOverride: VehiclePictureDb | null = null;
let settingsLoadOverride: (() => ReturnType<typeof loadVehiclePicturesSettings>) | null = null;
let settingsSaveOverride: ((patch: Parameters<typeof saveVehiclePicturesSettings>[0]) => Promise<void>) | null =
  null;
let spendOverride: (() => Promise<{ usedUsd: number; budgetUsd: number }>) | null = null;
let kickWorkerOverride: ((supabase: SupabaseClient) => Promise<void>) | null = null;

export function setVehiclePictureStorageDepsForTests(deps: FlowDeps | null): void {
  storageDepsOverride = deps;
}
export function setVehiclePictureAdminAuditForTests(fn: typeof logAdminAction | null): void {
  auditOverride = fn;
}
export function setVehiclePictureRegenLimitForTests(fn: ((userId: string) => Promise<boolean>) | null): void {
  allowRegenOverride = fn;
}
export function setVehiclePictureAdminDbForTests(db: VehiclePictureDb | null): void {
  dbOverride = db;
}
export function setVehiclePictureAdminSettingsForTests(opts: {
  load?: () => ReturnType<typeof loadVehiclePicturesSettings>;
  save?: (patch: Parameters<typeof saveVehiclePicturesSettings>[0]) => Promise<void>;
} | null): void {
  settingsLoadOverride = opts?.load ?? null;
  settingsSaveOverride = opts?.save ?? null;
}
export function setVehiclePictureSpendForTests(
  fn: (() => Promise<{ usedUsd: number; budgetUsd: number }>) | null,
): void {
  spendOverride = fn;
}
export function setVehiclePictureKickWorkerForTests(
  fn: ((supabase: SupabaseClient) => Promise<void>) | null,
): void {
  kickWorkerOverride = fn;
}

function storageDeps(): FlowDeps {
  return storageDepsOverride ?? storageDepsFromEnv();
}

function apiError(
  c: Context,
  message: string,
  code: string,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 503 = 400,
) {
  return c.json({ error: message, code }, status);
}

function staffUser(c: Context): RbacUser | undefined {
  return c.get("rbacUser") as RbacUser | undefined;
}

async function audit(
  c: Context,
  action: string,
  pictureId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const userId = catalogActorId(c);
  if (!userId) return;
  const log = auditOverride ?? logAdminAction;
  await log({
    actorUserId: userId,
    action,
    resourceType: "vehicle_picture",
    resourceId: pictureId,
    metadata,
    request: c.req.raw,
  });
}

function pictureUrlFromKey(r2Key: string | null | undefined, slot: "card" | "detail") {
  const base = publicMediaUrl(r2Key);
  return base ? vehiclePictureSrc(base, slot) : null;
}

function listItem(row: VehiclePictureRow) {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    generation: row.generation,
    bodyType: row.body_type,
    startYear: row.start_year,
    endYear: row.end_year,
    color: row.color,
    status: row.status,
    rating: row.staff_rating,
    source: row.source,
    madeAt: row.made_at,
    url: pictureUrlFromKey(row.r2_key, "card"),
    stale: row.stale,
  };
}

async function geminiSpend(): Promise<{ usedUsd: number; budgetUsd: number }> {
  if (spendOverride) return spendOverride();
  const budget = await getBudget("gemini" as Provider);
  const month = new Date().toISOString().slice(0, 7);
  const totals = await readUsageTotals("gemini" as Provider, [month]);
  const usedUsd = totals.get(month)?.costUSD ?? 0;
  const budgetUsd = budget?.monthlyBudgetUSD ?? 0;
  return { usedUsd, budgetUsd };
}

function ownerDenied(c: Context): Response | null {
  const user = staffUser(c);
  if (!user || !hasPlatformOwnerAccess(user)) {
    return apiError(c, "Owner approval required", "FORBIDDEN", 403);
  }
  return null;
}

async function allowRegen(userId: string): Promise<boolean> {
  if (allowRegenOverride) return allowRegenOverride(userId);
  return allowRequest(`vp-regen:${userId}`, REGEN_PER_DAY, REGEN_WINDOW_MS);
}

export function dominionPictureJsonLeak(text: string): string | null {
  const lower = text.toLowerCase();
  const forbidden = [
    "organizationid",
    "organization_id",
    "vehicle_id",
    "license_plate",
    "licenseplate",
    "used by",
    "queued_by_org",
  ];
  for (const f of forbidden) {
    if (lower.includes(f)) return f;
  }
  if (/\bfleet\b/i.test(text) && !text.includes("roamfleet.co")) return "fleet";
  if (/\bdriver\b/i.test(text)) return "driver";
  return null;
}

export function registerVehiclePictureAdminRoutes(route: RouteApp, supabase: SupabaseClient): void {
  let r2: R2Client | null = null;
  try {
    r2 = new R2Client(r2ConfigFromEnv());
  } catch {
    r2 = null;
  }

  const db = () => dbOverride ?? createVehiclePictureDb(supabase);
  const loadSettings = () => (settingsLoadOverride ?? loadVehiclePicturesSettings)();
  const saveSettings = (patch: Parameters<typeof saveVehiclePicturesSettings>[0]) =>
    (settingsSaveOverride ?? saveVehiclePicturesSettings)(patch);
  const kickWorker = () => (kickWorkerOverride ?? kickVehiclePictureWorker)(supabase);

  route.get("/make-server-37f42386/admin/vehicle-pictures", requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    try {
      const page = Math.max(1, Number(c.req.query("page") ?? 1));
      const staleOnly = c.req.query("stale") === "1";
      const { items, total } = await db().listAdminPictures({
        search: c.req.query("search") ?? undefined,
        color: c.req.query("color") ?? undefined,
        status: c.req.query("status") ?? undefined,
        rating: c.req.query("rating") ?? undefined,
        staleOnly,
        page,
        pageSize: PAGE_SIZE,
      });
      const settings = await loadSettings();
      const now = new Date();
      const counts = await db().adminPictureCounts();
      const pictureSpend = await geminiSpend();
      const budgetBlocked = pictureSpend.budgetUsd > 0 && pictureSpend.usedUsd >= pictureSpend.budgetUsd;
      const remakePausedLeft = budgetBlocked ? await db().countRemakeLaneActive() : null;
      const pause = isPicturesPaused(settings, now)
        ? {
          until: settings.vehicle_pictures_paused_until,
          reason: settings.vehicle_pictures_pause_reason ?? null,
        }
        : null;
      return c.json({
        items: items.map((row) => listItem(row)),
        total,
        counts,
        pictureSpend,
        aiPicturesOn: settings.ai_vehicle_pictures === true,
        pause,
        remakePausedLeft,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load vehicle pictures";
      return apiError(c, msg, "LIST_FAILED", 500);
    }
  });

  route.get("/make-server-37f42386/admin/vehicle-pictures/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    const id = c.req.param("id")?.trim() ?? "";
    try {
      const row = await db().getPictureById(id);
      if (!row || row.deleted_at) return apiError(c, "Picture not found", "NOT_FOUND", 404);
      const inUse = (await db().countVehiclesWithPicture(id)) > 0;
      const versions = await db().listVersions(id);
      const versionRows = [];
      for (const v of versions) {
        const exists = r2 ? await r2.head("public", v.r2_key) : { size: 1 };
        versionRows.push({
          version: v.version,
          source: v.source,
          createdAt: v.created_at,
          retiredAt: v.retired_at,
          url: exists ? pictureUrlFromKey(v.r2_key, "detail") : null,
        });
      }
      return c.json({
        picture: listItem(row),
        inUse,
        howMade: {
          promptVersion: row.prompt_version,
          aiModel: row.ai_model,
          costUsd: row.cost_usd,
          madeAt: row.made_at,
          attempts: row.attempts,
          lastError: row.last_error,
        },
        versions: versionRows,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load picture";
      return apiError(c, msg, "DETAIL_FAILED", 500);
    }
  });

  route.post("/make-server-37f42386/admin/vehicle-pictures/toggle", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const owner = ownerDenied(c);
    if (owner) return owner;
    try {
      const body = await c.req.json().catch(() => ({})) as { enabled?: unknown };
      const enabled = body.enabled === true;
      await saveSettings({ ai_vehicle_pictures: enabled });
      await audit(c, "vehicle_picture_toggle", "global", { enabled });
      return c.json({ ok: true, aiPicturesOn: enabled });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save setting";
      return apiError(c, msg, "TOGGLE_FAILED", 500);
    }
  });

  route.post(
    "/make-server-37f42386/admin/vehicle-pictures/remake-outdated/preview",
    requireAuth(),
    async (c: Context) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      const owner = ownerDenied(c);
      if (owner) return owner;
      try {
        const settings = await loadSettings();
        const model = settings.vehicle_picture_model;
        const ids = await db().listOutdatedReadyPictureIds(PROMPT_VERSION, model);
        const count = ids.length;
        const costUsd = count * PICTURE_UNIT_COST;
        const hours = count / REMAKE_HOUR_RATE;
        const spend = await geminiSpend();
        const remaining = Math.max(0, spend.budgetUsd - spend.usedUsd);
        return c.json({
          count,
          costUsd,
          hours,
          fitsThisMonth: remaining >= costUsd,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not preview remake";
        return apiError(c, msg, "PREVIEW_FAILED", 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/admin/vehicle-pictures/remake-outdated",
    requireAuth(),
    async (c: Context) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      const owner = ownerDenied(c);
      if (owner) return owner;
      try {
        const settings = await loadSettings();
        const model = settings.vehicle_picture_model;
        const ids = await db().listOutdatedReadyPictureIds(PROMPT_VERSION, model);
        const nowIso = new Date().toISOString();
        const queued = await db().queueRemakeBatch(ids, nowIso);
        await kickWorker();
        await audit(c, "vehicle_picture_remake_outdated", "bulk", { queued });
        return c.json({ ok: true, queued });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not queue remake";
        return apiError(c, msg, "REMAKE_FAILED", 500);
      }
    },
  );

  route.post("/make-server-37f42386/admin/vehicle-pictures/:id/rate", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id")?.trim() ?? "";
    try {
      const body = await c.req.json().catch(() => ({})) as { rating?: string };
      const rating = body.rating === "good" || body.rating === "wrong" ? body.rating : null;
      if (!rating) return apiError(c, 'Rating must be "good" or "wrong"', "INVALID_RATING", 400);
      await db().setStaffRating(id, rating);
      await audit(c, "vehicle_picture_rate", id, { rating });
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save rating";
      return apiError(c, msg, "RATE_FAILED", 500);
    }
  });

  route.post("/make-server-37f42386/admin/vehicle-pictures/:id/regenerate", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id")?.trim() ?? "";
    const userId = catalogActorId(c) ?? "";
    if (!userId) return apiError(c, "Unauthorized", "UNAUTHORIZED", 401);
    const ok = await allowRegen(userId);
    if (!ok) {
      return apiError(c, "Daily regenerate limit reached", "RATE_LIMITED", 429);
    }
    try {
      await regeneratePicture({ supabase, r2, now: () => new Date(), db: db() }, id, userId);
      await audit(c, "vehicle_picture_regenerate", id, {});
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not queue regenerate";
      return apiError(c, msg, "REGENERATE_FAILED", 500);
    }
  });

  route.post(
    "/make-server-37f42386/admin/vehicle-pictures/:id/replace/start",
    requireAuth(),
    async (c: Context) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      const user = staffUser(c);
      const body = await c.req.json().catch(() => ({})) as { contentType?: unknown; size?: unknown };
      try {
        const started = await startUpload({
          purpose: "catalogue-images",
          scopeId: "platform",
          userId: user?.userId ?? "",
          contentType: String(body.contentType ?? ""),
          size: Number(body.size),
        }, storageDeps());
        return c.json(started);
      } catch (e) {
        if (e instanceof StorageFlowError) return apiError(c, e.message, "UPLOAD_START_FAILED", e.status);
        return apiError(c, e instanceof Error ? e.message : "Upload failed", "UPLOAD_START_FAILED", 500);
      }
    },
  );

  route.post(
    "/make-server-37f42386/admin/vehicle-pictures/:id/replace/finish",
    requireAuth(),
    async (c: Context) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      const id = c.req.param("id")?.trim() ?? "";
      const userId = catalogActorId(c) ?? "";
      const body = await c.req.json().catch(() => ({})) as { ticket?: unknown };
      try {
        const done = await finishUpload(
          { ticket: String(body.ticket ?? ""), userId },
          storageDeps(),
        );
        if (done.purpose !== "catalogue-images") {
          return apiError(c, "Wrong upload ticket", "UPLOAD_TICKET_INVALID", 400);
        }
        await replacePicture({ supabase, r2, now: () => new Date(), db: db() }, id, done.key, userId);
        await audit(c, "vehicle_picture_replace", id, {});
        return c.json({ ok: true, key: done.key });
      } catch (e) {
        if (e instanceof UploadTypeNotAllowedError) {
          return apiError(c, "That file type is not allowed", e.code, 400);
        }
        if (e instanceof StorageFlowError) return apiError(c, e.message, "UPLOAD_FINISH_FAILED", e.status);
        return apiError(c, e instanceof Error ? e.message : "Replace failed", "REPLACE_FAILED", 500);
      }
    },
  );

  route.post("/make-server-37f42386/admin/vehicle-pictures/:id/restore", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id")?.trim() ?? "";
    const userId = catalogActorId(c) ?? "";
    try {
      await restorePrevious({ supabase, r2, now: () => new Date(), db: db() }, id, userId);
      await audit(c, "vehicle_picture_restore", id, {});
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not restore";
      return apiError(c, msg, "RESTORE_FAILED", 500);
    }
  });

  route.delete("/make-server-37f42386/admin/vehicle-pictures/:id", requireAuth(), async (c: Context) => {
    const denied = assertCatalogWriteResponse(c);
    if (denied) return denied;
    const id = c.req.param("id")?.trim() ?? "";
    try {
      await removePicture({ supabase, r2, now: () => new Date(), db: db() }, id);
      await audit(c, "vehicle_picture_remove", id, {});
      return c.json({ ok: true });
    } catch (e) {
      if (e instanceof PictureInUseError) {
        return apiError(
          c,
          "Apps already use this picture — regenerate or replace it instead.",
          "PICTURE_IN_USE",
          409,
        );
      }
      const msg = e instanceof Error ? e.message : "Could not remove";
      return apiError(c, msg, "REMOVE_FAILED", 500);
    }
  });
}