/**
 * Dominion part pictures (docs/part-pictures-audit.md §3.5) — mounted on platform-catalog, staff only, the same auth
 * as the saved-page routes: staff read; owner for the templates, the bulk remake and the settings. Remake, Hide and
 * Show are staff actions (§3.5), each logged.
 *
 * Dominion shows only its own data: no fleet name, plate, driver, vehicle count or "used by" (PP-17).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { logAdminAction } from "../_shared/auditLog.ts";
import { assertCatalogStaffReadResponse, catalogActorId } from "./catalog_access.ts";
import { hasPlatformOwnerAccess, requireAuth, type RbacUser } from "./rbac_middleware.ts";
import {
  createPartPictureAdminDb,
  type AdminPictureRow,
  type AdminTemplateRow,
  type PartPictureAdminDb,
  type PictureCursor,
} from "./part_picture_admin_db.ts";
import {
  bannersFor,
  geminiMonthSpend,
  partPictureSpendThisMonth,
  pictureBlockers,
  queueBlocked,
  shapePictures,
  type PictureBlockers,
} from "./part_picture_reads.ts";
import {
  loadPartPicturesSettings,
  partPictureDay,
  savePartPicturesSettings,
  type PartPicturesSettings,
  type PartPicturesSettingsKv,
} from "./part_pictures_settings.ts";

export const PART_PICTURE_ADMIN_PREFIX = "/make-server-37f42386/admin/part-pictures";
export const PART_PICTURE_TEMPLATE_PREFIX = "/make-server-37f42386/admin/part-picture-templates";

const PAGE_SIZE = 24;
/** §4 S3 bulk remake: a picture costs about 4 US cents. */
const PICTURE_UNIT_COST = 0.04;
/** §3.5 / §4 S2: the one sentence a Remake without a diagram answers. */
export const NO_DIAGRAM_MESSAGE = "Upload the page again as a single file to remake this picture.";

const STATUS_FILTERS = new Set(["made", "being_made", "waiting", "failed", "hidden"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  put: (path: string, ...handlers: unknown[]) => void;
};

let dbOverride: PartPictureAdminDb | null = null;
let settingsLoadOverride: (() => Promise<PartPicturesSettings>) | null = null;
let settingsSaveOverride: ((patch: Partial<PartPicturesSettingsKv>) => Promise<void>) | null = null;
let spendOverride: (() => Promise<{ usedUsd: number; budgetUsd: number }>) | null = null;
let auditOverride: typeof logAdminAction | null = null;

export function setPartPictureAdminDbForTests(db: PartPictureAdminDb | null): void {
  dbOverride = db;
}
export function setPartPictureAdminSettingsForTests(
  opts: {
    load?: () => Promise<PartPicturesSettings>;
    save?: (patch: Partial<PartPicturesSettingsKv>) => Promise<void>;
  } | null,
): void {
  settingsLoadOverride = opts?.load ?? null;
  settingsSaveOverride = opts?.save ?? null;
}
export function setPartPictureAdminSpendForTests(
  fn: (() => Promise<{ usedUsd: number; budgetUsd: number }>) | null,
): void {
  spendOverride = fn;
}
export function setPartPictureAdminAuditForTests(fn: typeof logAdminAction | null): void {
  auditOverride = fn;
}

function apiError(
  c: Context,
  message: string,
  code: string,
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500 = 400,
) {
  return c.json({ error: message, code }, status);
}

function staffUser(c: Context): RbacUser | undefined {
  return c.get("rbacUser") as RbacUser | undefined;
}

function ownerDenied(c: Context): Response | null {
  const user = staffUser(c);
  if (!user || !hasPlatformOwnerAccess(user)) {
    return apiError(c, "Owner approval required", "FORBIDDEN", 403);
  }
  return null;
}

async function audit(
  c: Context,
  action: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const userId = catalogActorId(c);
  if (!userId) return;
  const log = auditOverride ?? logAdminAction;
  await log({
    actorUserId: userId,
    action,
    resourceType: "part_picture",
    resourceId,
    metadata,
    request: c.req.raw,
  });
}

/** PP-17: what a Dominion answer must never carry. */
export function dominionPartPictureJsonLeak(text: string): string | null {
  const lower = text.toLowerCase();
  for (const forbidden of [
    "organizationid",
    "organization_id",
    "license_plate",
    "licenseplate",
    "vehicle_id",
    "used by",
    "fleetcount",
  ]) {
    if (lower.includes(forbidden)) return forbidden;
  }
  for (const word of ["fleet", "driver", "plate", "vehicle"]) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) return word;
  }
  return null;
}

/** The database statuses a screen filter means. `[]` = nothing can match. */
export function statusesForFilter(view: string | null, blockers: PictureBlockers): string[] | null {
  if (!view) return null;
  if (view === "made") return ["ready"];
  if (view === "failed") return ["failed"];
  if (view === "hidden") return ["hidden"];
  const blocked = queueBlocked(blockers);
  const inProgress = ["queued", "making"];
  if (view === "waiting") return blocked ? inProgress : [];
  return blocked ? [] : inProgress;
}

/** A page boundary token: the row's `created_at` and `id`, base64. */
export function encodeCursor(row: AdminPictureRow): string {
  return btoa(`${row.created_at}|${row.id}`);
}

export function decodeCursor(raw: string | null | undefined): PictureCursor | "bad" | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  try {
    const plain = atob(text);
    const at = plain.indexOf("|");
    if (at <= 0) return "bad";
    const createdAt = plain.slice(0, at);
    const id = plain.slice(at + 1);
    if (!createdAt || !UUID.test(id)) return "bad";
    return { createdAt, id };
  } catch {
    return "bad";
  }
}

function templateJson(row: AdminTemplateRow, name: string | null, updatedByName: string | null) {
  return {
    catalogGroupId: row.catalog_group_id,
    name: name ?? "",
    materials: row.materials,
    enabled: row.enabled,
    version: row.version,
    updatedBy: row.updated_by,
    updatedByName,
    updatedAt: row.updated_at,
  };
}

function settingsJson(settings: PartPicturesSettings) {
  return {
    aiPartPictures: settings.ai_part_pictures === true,
    model: settings.part_picture_model,
    maxAttempts: settings.max_attempts,
    dailyMax: settings.daily_max,
    retentionDays: settings.retention_days,
    pausedUntil: settings.part_pictures_paused_until ?? null,
    pauseReason: settings.part_pictures_pause_reason ?? null,
  };
}

/** The profile name (else email) of whoever last edited a template. Best effort: never a reason to fail. */
async function staffName(supabase: SupabaseClient, id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    const { data } = await supabase.auth.admin.getUserById(id);
    const user = data?.user;
    const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
    return String(meta.full_name || meta.name || user?.email || "").trim() || null;
  } catch {
    return null;
  }
}

export function registerPartPictureAdminRoutes(route: RouteApp, supabase: SupabaseClient): void {
  const db = () => dbOverride ?? createPartPictureAdminDb(supabase);
  const loadSettings = () => (settingsLoadOverride ?? loadPartPicturesSettings)();
  const saveSettings = (patch: Partial<PartPicturesSettingsKv>) =>
    (settingsSaveOverride ?? savePartPicturesSettings)(patch);
  const spend = () => (spendOverride ?? geminiMonthSpend)();

  /** The blockers + the two spend numbers one answer needs. */
  const pictureContext = async (store: PartPictureAdminDb) => {
    const now = new Date();
    const [settings, geminiSpend, madeToday] = await Promise.all([
      loadSettings(),
      spend(),
      store.countMadeOn(partPictureDay(now)),
    ]);
    return {
      settings,
      spend: geminiSpend,
      madeToday,
      blockers: pictureBlockers(settings, { now, geminiSpend, madeToday }),
    };
  };

  const shaped = async (store: PartPictureAdminDb, row: AdminPictureRow | null, blockers: PictureBlockers) => {
    if (!row) return null;
    const [dto] = await shapePictures(store, [row], blockers);
    return dto ?? null;
  };

  // ------------------------------------------------------------------ GET part-pictures
  route.get(PART_PICTURE_ADMIN_PREFIX, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    try {
      const store = db();
      const statusRaw = (c.req.query("status") ?? "").trim();
      if (statusRaw && !STATUS_FILTERS.has(statusRaw)) {
        return apiError(c, "Unknown state", "BAD_STATUS", 400);
      }
      const after = decodeCursor(c.req.query("after"));
      if (after === "bad") return apiError(c, "Bad page token", "BAD_PAGE", 400);
      const before = decodeCursor(c.req.query("before"));
      if (before === "bad") return apiError(c, "Bad page token", "BAD_PAGE", 400);

      const context = await pictureContext(store);
      const query = {
        catalogGroupId: (c.req.query("catalogGroupId") ?? "").trim() || null,
        savedPageId: (c.req.query("savedPageId") ?? "").trim() || null,
        search: (c.req.query("search") ?? "").trim() || null,
        page: Math.max(1, Number(c.req.query("page") ?? 1) || 1),
        pageSize: PAGE_SIZE,
        statusIn: statusesForFilter(statusRaw || null, context.blockers),
        after: before ? null : after,
        before,
      };
      const { rows, total, hasOlder } = await store.listPictures(query);
      const items = await shapePictures(store, rows, context.blockers);
      const counts = await store.countStates();
      const partPictureSpendUsd = await partPictureSpendThisMonth(store);
      const blocked = queueBlocked(context.blockers);
      return c.json({
        items,
        page: query.page,
        pageSize: PAGE_SIZE,
        total,
        hasOlder,
        hasNewer: Boolean(after) || Boolean(before) || query.page > 1,
        nextAfter: rows.length ? encodeCursor(rows[rows.length - 1]) : null,
        nextBefore: rows.length ? encodeCursor(rows[0]) : null,
        counts: {
          ready: counts.ready,
          beingMade: blocked ? 0 : counts.inProgress,
          waiting: blocked ? counts.inProgress : 0,
          failed: counts.failed,
          hidden: counts.hidden,
        },
        madeToday: { count: context.madeToday, dailyMax: context.settings.daily_max },
        partPictureSpendUsd,
        pictureSpend: context.spend,
        aiPicturesOn: context.blockers.aiOn,
        pause: context.blockers.paused
          ? { until: context.blockers.pauseUntil, reason: context.blockers.pauseReason }
          : null,
        banners: bannersFor(context.blockers, context.spend),
      });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not load part pictures", "LIST_FAILED", 500);
    }
  });

  // ------------------------------------------------------------------ GET part-pictures/by-numbers (S2 job panel)
  // The job panel shows the picture of each number it added. One read for up to 20 numbers: number → picture | null.
  route.get(`${PART_PICTURE_ADMIN_PREFIX}/by-numbers`, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    const numbers = [...new Set((c.req.query("numbers") ?? "").split(",").map((n) => n.trim()).filter(Boolean))]
      .slice(0, 20);
    if (!numbers.length) return c.json({ items: [] });
    try {
      const store = db();
      const context = await pictureContext(store);
      const groupByNumber = await store.interchangeGroupsForNumbers(numbers);
      const rows = await store.picturesByGroupIds([...new Set(groupByNumber.values())]);
      const dtos = await shapePictures(store, rows, context.blockers);
      const byGroup = new Map(rows.map((row, i) => [row.interchange_group_id, dtos[i] ?? null]));
      const keyOf = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return c.json({
        aiPicturesOn: context.blockers.aiOn,
        items: numbers.map((number) => {
          const groupId = groupByNumber.get(keyOf(number));
          return { number, picture: groupId ? (byGroup.get(groupId) ?? null) : null };
        }),
      });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not load the pictures", "LIST_FAILED", 500);
    }
  });

  // ------------------------------------------------------------------ GET/PUT part-pictures/settings
  route.get(`${PART_PICTURE_ADMIN_PREFIX}/settings`, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    try {
      return c.json({ settings: settingsJson(await loadSettings()) });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not load the settings", "SETTINGS_FAILED", 500);
    }
  });

  route.put(`${PART_PICTURE_ADMIN_PREFIX}/settings`, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    const owner = ownerDenied(c);
    if (owner) return owner;
    try {
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const patch: Partial<PartPicturesSettingsKv> = {};
      if (body.aiPartPictures !== undefined) {
        if (typeof body.aiPartPictures !== "boolean") return apiError(c, "Wrong setting", "BAD_SETTING", 400);
        patch.ai_part_pictures = body.aiPartPictures;
      }
      for (const [key, field, max] of [
        ["maxAttempts", "max_attempts", 10],
        ["dailyMax", "daily_max", 1000],
        ["retentionDays", "retention_days", 365],
      ] as const) {
        if (body[key] === undefined) continue;
        const value = Number(body[key]);
        if (!Number.isInteger(value) || value < 0 || value > max) {
          return apiError(c, "Wrong setting", "BAD_SETTING", 400);
        }
        patch[field] = value;
      }
      if (body.model !== undefined) {
        const model = String(body.model ?? "").trim().slice(0, 80);
        if (!model) return apiError(c, "Wrong setting", "BAD_SETTING", 400);
        patch.part_picture_model = model;
      }
      if (!Object.keys(patch).length) return apiError(c, "Nothing to save", "NOTHING_TO_SAVE", 400);
      await saveSettings(patch);
      await audit(c, "part_picture_settings", "global", patch as Record<string, unknown>);
      return c.json({ ok: true, settings: settingsJson(await loadSettings()) });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not save the settings", "SETTINGS_FAILED", 500);
    }
  });

  // ------------------------------------------------------------------ POST part-pictures/:id/remake · /hide · /show
  route.post(`${PART_PICTURE_ADMIN_PREFIX}/:id/remake`, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    const id = c.req.param("id")?.trim() ?? "";
    if (!UUID.test(id)) return apiError(c, "Picture not found", "NOT_FOUND", 404);
    try {
      const store = db();
      const picture = await store.getPicture(id);
      if (!picture) return apiError(c, "Picture not found", "NOT_FOUND", 404);
      if (picture.status === "queued" || picture.status === "making") {
        return apiError(c, "This picture is being made.", "ALREADY_MAKING", 409);
      }
      if (picture.status === "hidden") {
        return apiError(c, "Show this picture before remaking it.", "HIDDEN", 409);
      }
      // §3.5: no diagram left (past 30 days) means the page has to be uploaded again.
      const diagrams = await store.liveDiagramPictureIds([id]);
      if (!diagrams.length) return apiError(c, NO_DIAGRAM_MESSAGE, "NO_DIAGRAM", 409);
      await store.remake(id, picture.version + 1, new Date().toISOString());
      await audit(c, "part_picture_remake", id, { version: picture.version + 1 });
      const fresh = await store.getPicture(id);
      const { blockers } = await pictureContext(store);
      // The worker takes it on its next run (the cron runs every two minutes).
      return c.json({ ok: true, picture: await shaped(store, fresh, blockers) });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not queue the remake", "REMAKE_FAILED", 500);
    }
  });

  route.post(`${PART_PICTURE_ADMIN_PREFIX}/:id/hide`, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    const id = c.req.param("id")?.trim() ?? "";
    if (!UUID.test(id)) return apiError(c, "Picture not found", "NOT_FOUND", 404);
    try {
      const store = db();
      const picture = await store.getPicture(id);
      if (!picture) return apiError(c, "Picture not found", "NOT_FOUND", 404);
      if (picture.status !== "hidden") {
        if (picture.status !== "ready") return apiError(c, "Only a made picture can be hidden.", "NOT_READY", 409);
        await store.hide(id, catalogActorId(c), new Date().toISOString());
        await audit(c, "part_picture_hide", id, {});
      }
      const fresh = await store.getPicture(id);
      const { blockers } = await pictureContext(store);
      return c.json({ ok: true, picture: await shaped(store, fresh, blockers) });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not hide the picture", "HIDE_FAILED", 500);
    }
  });

  route.post(`${PART_PICTURE_ADMIN_PREFIX}/:id/show`, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    const id = c.req.param("id")?.trim() ?? "";
    if (!UUID.test(id)) return apiError(c, "Picture not found", "NOT_FOUND", 404);
    try {
      const store = db();
      const picture = await store.getPicture(id);
      if (!picture) return apiError(c, "Picture not found", "NOT_FOUND", 404);
      if (picture.status !== "ready") {
        if (picture.status !== "hidden") return apiError(c, "Only a hidden picture can be shown.", "NOT_HIDDEN", 409);
        await store.show(id);
        await audit(c, "part_picture_show", id, {});
      }
      const fresh = await store.getPicture(id);
      const { blockers } = await pictureContext(store);
      return c.json({ ok: true, picture: await shaped(store, fresh, blockers) });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not show the picture", "SHOW_FAILED", 500);
    }
  });

  // ------------------------------------------------------------------ GET part-picture-templates
  route.get(PART_PICTURE_TEMPLATE_PREFIX, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    try {
      const store = db();
      const templates = await store.loadTemplates();
      const names = await store.groupNames(templates.map((row) => row.catalog_group_id));
      const updatedByIds = [...new Set(templates.map((row) => row.updated_by).filter((id): id is string => Boolean(id)))];
      const staffNames = new Map<string, string | null>();
      for (const id of updatedByIds) staffNames.set(id, await staffName(supabase, id));
      return c.json({
        items: templates.map((row) =>
          templateJson(
            row,
            names.get(row.catalog_group_id) ?? null,
            row.updated_by ? (staffNames.get(row.updated_by) ?? null) : null,
          )
        ),
      });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not load the templates", "TEMPLATES_FAILED", 500);
    }
  });

  // ------------------------------------------------------------------ PUT part-picture-templates/:catalogGroupId (owner)
  route.put(`${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId`, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    const owner = ownerDenied(c);
    if (owner) return owner;
    const groupId = c.req.param("catalogGroupId")?.trim() ?? "";
    if (!UUID.test(groupId)) return apiError(c, "Part group not found", "NOT_FOUND", 404);
    try {
      const store = db();
      const current = await store.getTemplate(groupId);
      if (!current) return apiError(c, "Part group not found", "NOT_FOUND", 404);
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const patch: { materials?: string; enabled?: boolean } = {};
      if (body.materials !== undefined) {
        if (typeof body.materials !== "string") return apiError(c, "Wrong template text", "BAD_TEMPLATE", 400);
        patch.materials = body.materials.trim().slice(0, 2000);
      }
      if (body.enabled !== undefined) {
        if (typeof body.enabled !== "boolean") return apiError(c, "Wrong switch", "BAD_TEMPLATE", 400);
        patch.enabled = body.enabled;
      }
      if (patch.materials === undefined && patch.enabled === undefined) {
        return apiError(c, "Nothing to save", "NOTHING_TO_SAVE", 400);
      }
      const sameText = patch.materials === undefined || patch.materials === current.materials;
      const sameSwitch = patch.enabled === undefined || patch.enabled === current.enabled;
      if (sameText && sameSwitch) return apiError(c, "No changes to save.", "UNCHANGED", 409);
      const saved = await store.saveTemplate(groupId, patch, catalogActorId(c), current.version + 1);
      if (!saved) return apiError(c, "Could not save the template", "TEMPLATE_SAVE_FAILED", 500);
      await audit(c, "part_picture_template_save", groupId, { ...patch, version: saved.version });
      const names = await store.groupNames([groupId]);
      return c.json({
        ok: true,
        template: templateJson(saved, names.get(groupId) ?? null, await staffName(supabase, saved.updated_by)),
      });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not save the template", "TEMPLATE_SAVE_FAILED", 500);
    }
  });

  // ------------------------------------------------------------------ remake-older: read staff, run owner
  const remakeOlderCounts = async (store: PartPictureAdminDb, groupId: string) => {
    const template = await store.getTemplate(groupId);
    if (!template) return null;
    const outdated = await store.outdatedPictures(groupId, template.version);
    const live = new Set(await store.liveDiagramPictureIds(outdated.map((row) => row.id)));
    const ready = outdated.filter((row) => live.has(row.id));
    const settings = await loadSettings();
    const count = ready.length;
    return {
      template,
      readyIds: ready.map((row) => row.id),
      count,
      needUpload: outdated.length - count,
      costUsd: Math.round(count * PICTURE_UNIT_COST * 100) / 100,
      // §4 S3: "about 1 day at 50 a day".
      days: settings.daily_max > 0 ? Math.ceil(count / settings.daily_max) : 0,
    };
  };

  route.get(`${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId/remake-older`, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    const groupId = c.req.param("catalogGroupId")?.trim() ?? "";
    if (!UUID.test(groupId)) return apiError(c, "Part group not found", "NOT_FOUND", 404);
    try {
      const counts = await remakeOlderCounts(db(), groupId);
      if (!counts) return apiError(c, "Part group not found", "NOT_FOUND", 404);
      return c.json({
        count: counts.count,
        needUpload: counts.needUpload,
        costUsd: counts.costUsd,
        days: counts.days,
      });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not count the pictures", "REMAKE_COUNT_FAILED", 500);
    }
  });

  route.post(`${PART_PICTURE_TEMPLATE_PREFIX}/:catalogGroupId/remake-older`, requireAuth(), async (c: Context) => {
    const denied = assertCatalogStaffReadResponse(c);
    if (denied) return denied;
    const owner = ownerDenied(c);
    if (owner) return owner;
    const groupId = c.req.param("catalogGroupId")?.trim() ?? "";
    if (!UUID.test(groupId)) return apiError(c, "Part group not found", "NOT_FOUND", 404);
    try {
      const store = db();
      const counts = await remakeOlderCounts(store, groupId);
      if (!counts) return apiError(c, "Part group not found", "NOT_FOUND", 404);
      // Only the ones that still have their diagram; the rest wait for the page to be uploaded again.
      const queued = await store.queueForRemake(counts.readyIds, new Date().toISOString());
      await audit(c, "part_picture_remake_older", groupId, { queued, needUpload: counts.needUpload });
      return c.json({ ok: true, queued, needUpload: counts.needUpload });
    } catch (e) {
      return apiError(c, e instanceof Error ? e.message : "Could not queue the remakes", "REMAKE_FAILED", 500);
    }
  });
}
