/**
 * Part pictures — the one shape every answer uses (docs/part-pictures-audit.md §3.5, point 2 of the build note), and
 * the "why is this one waiting" rule (§4 S2/S3), read from the same settings and pause fields the car page reads.
 *
 * No Dominion-only imports here: the saved-page result and the routes both use it, and it holds no auth logic.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getBudget, readUsageTotals } from "./api_usage_logger.ts";
import type { Provider } from "./api_pricing.ts";
import {
  createPartPictureAdminDb,
  type AdminPictureRow,
  type PartPictureAdminDb,
} from "./part_picture_admin_db.ts";
import { partPictureUrlFromKey, type PictureUrl } from "./part_picture_urls.ts";
import {
  isPartPicturesPaused,
  loadPartPicturesSettings,
  partPictureDay,
  type PartPicturesSettings,
} from "./part_pictures_settings.ts";

/** Why a queued or being-made picture is not moving. Null = it is moving (or it is not queued at all). */
export type PictureWaitReason = "off" | "budget" | "key_refused" | "paused" | null;

/** What a Dominion screen shows for one picture (§4 S2/S3). */
export type PictureView = "made" | "being_made" | "waiting" | "failed" | "hidden";

/** The four states the car page's banners come from, same field names. */
export type PictureBlockers = {
  aiOn: boolean;
  paused: boolean;
  pauseReason: string | null;
  pauseUntil: string | null;
  /** The Gemini cap is used up or today's max is reached: the queue cannot run. */
  budgetBlocked: boolean;
};

export type PictureBanner = {
  kind: "key_refused" | "paused" | "ai_off" | "budget_80";
  reason?: string | null;
  until?: string | null;
};

export type PartPictureDto = {
  id: string;
  status: PictureView;
  waitingReason: PictureWaitReason;
  /** Card size (24 cards a page). */
  url: PictureUrl | null;
  /** Detail size (the large view). */
  urlDetail: PictureUrl | null;
  partNumber: string;
  partName: string;
  manufacturer: string;
  catalogGroup: { id: string; name: string } | null;
  madeAt: string | null;
  version: number;
  templateVersion: number | null;
  /** A `part_picture_diagram` row that has not been deleted, so Remake can run (§4 S2). */
  hasDiagram: boolean;
};

const norm = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const monthStart = (now: Date): string => `${now.toISOString().slice(0, 7)}-01T00:00:00.000Z`;

/** The blockers from the settings, the Gemini budget and today's count. Pure, so the states can be tested alone. */
export function pictureBlockers(
  settings: PartPicturesSettings,
  opts: { now: Date; geminiSpend: { usedUsd: number; budgetUsd: number }; madeToday: number },
): PictureBlockers {
  const { now, geminiSpend, madeToday } = opts;
  const dailyFull = settings.daily_max > 0 && madeToday >= settings.daily_max;
  const capFull = geminiSpend.budgetUsd > 0 && geminiSpend.usedUsd >= geminiSpend.budgetUsd;
  const paused = isPartPicturesPaused(settings, now);
  return {
    aiOn: settings.ai_part_pictures === true,
    paused,
    pauseReason: paused ? (settings.part_pictures_pause_reason ?? null) : null,
    pauseUntil: paused ? (settings.part_pictures_paused_until ?? null) : null,
    budgetBlocked: dailyFull || capFull,
  };
}

/** True while any of the four blockers is in force. */
export function queueBlocked(blockers: PictureBlockers): boolean {
  return !blockers.aiOn || blockers.paused || blockers.budgetBlocked;
}

/** `off` beats `key_refused`, which beats `paused`, which beats `budget`: the row waits for the first reason. */
export function waitReasonFor(status: string, blockers: PictureBlockers): PictureWaitReason {
  if (status !== "queued" && status !== "making") return null;
  if (!blockers.aiOn) return "off";
  if (blockers.paused) return blockers.pauseReason === "key" ? "key_refused" : "paused";
  if (blockers.budgetBlocked) return "budget";
  return null;
}

/** The one word a card shows (§4 S2/S3). */
export function viewFor(status: string, blockers: PictureBlockers): PictureView {
  if (status === "ready") return "made";
  if (status === "failed") return "failed";
  if (status === "hidden") return "hidden";
  return waitReasonFor(status, blockers) ? "waiting" : "being_made";
}

/** The four banners, in the order the car page shows them (§4 S3). */
export function bannersFor(
  blockers: PictureBlockers,
  spend: { usedUsd: number; budgetUsd: number },
): PictureBanner[] {
  const out: PictureBanner[] = [];
  if (blockers.paused) {
    out.push(
      blockers.pauseReason === "key"
        ? { kind: "key_refused", reason: blockers.pauseReason, until: blockers.pauseUntil }
        : { kind: "paused", reason: blockers.pauseReason, until: blockers.pauseUntil },
    );
  }
  if (!blockers.aiOn) out.push({ kind: "ai_off" });
  if (spend.budgetUsd > 0 && (spend.usedUsd / spend.budgetUsd) * 100 >= 80) out.push({ kind: "budget_80" });
  return out;
}

export function partPictureDto(
  row: AdminPictureRow,
  opts: { blockers: PictureBlockers; hasDiagram: boolean; groupName?: string | null },
): PartPictureDto {
  const groupId = row.catalog_group_id;
  const groupName = opts.groupName ?? null;
  return {
    id: row.id,
    status: viewFor(row.status, opts.blockers),
    waitingReason: waitReasonFor(row.status, opts.blockers),
    url: partPictureUrlFromKey(row.r2_key, "card"),
    urlDetail: partPictureUrlFromKey(row.r2_key, "detail"),
    partNumber: row.part_number,
    partName: row.part_name,
    manufacturer: row.manufacturer,
    catalogGroup: groupId ? { id: groupId, name: groupName ?? "" } : null,
    madeAt: row.made_at,
    version: row.version,
    templateVersion: row.template_version,
    hasDiagram: opts.hasDiagram,
  };
}

/** Shapes a set of rows with one diagram check and one group-name read. */
export async function shapePictures(
  db: PartPictureAdminDb,
  pictureRows: AdminPictureRow[],
  blockers: PictureBlockers,
): Promise<PartPictureDto[]> {
  if (!pictureRows.length) return [];
  const [diagramIds, names] = await Promise.all([
    db.liveDiagramPictureIds(pictureRows.map((row) => row.id)),
    db.groupNames(pictureRows.map((row) => row.catalog_group_id).filter((id): id is string => Boolean(id))),
  ]);
  const live = new Set(diagramIds);
  return pictureRows.map((row) =>
    partPictureDto(row, {
      blockers,
      hasDiagram: live.has(row.id),
      groupName: row.catalog_group_id ? (names.get(row.catalog_group_id) ?? null) : null,
    })
  );
}

/** Gemini's month-to-date spend and cap (the same two numbers the car page's AI card shows). */
export async function geminiMonthSpend(): Promise<{ usedUsd: number; budgetUsd: number }> {
  const budget = await getBudget("gemini" as Provider);
  const month = new Date().toISOString().slice(0, 7);
  const totals = await readUsageTotals("gemini" as Provider, [month]);
  return {
    usedUsd: totals.get(month)?.costUSD ?? 0,
    budgetUsd: budget?.monthlyBudgetUSD ?? 0,
  };
}

/** The production blockers for a route: settings + Gemini spend + how many pictures were made today. */
export async function readPictureBlockers(
  supabase: SupabaseClient,
  opts: { now?: Date; spend?: () => Promise<{ usedUsd: number; budgetUsd: number }>; db?: PartPictureAdminDb } = {},
): Promise<{ blockers: PictureBlockers; settings: PartPicturesSettings; spend: { usedUsd: number; budgetUsd: number }; madeToday: number }> {
  const now = opts.now ?? new Date();
  const db = opts.db ?? createPartPictureAdminDb(supabase);
  const [settings, spend, madeToday] = await Promise.all([
    loadPartPicturesSettings(),
    (opts.spend ?? geminiMonthSpend)(),
    db.countMadeOn(partPictureDay(now)),
  ]);
  return { blockers: pictureBlockers(settings, { now, geminiSpend: spend, madeToday }), settings, spend, madeToday };
}

/** Cost booked on part pictures since the start of this UTC month (the Gemini budget's own month). */
export async function partPictureSpendThisMonth(
  db: PartPictureAdminDb,
  now: Date = new Date(),
): Promise<number> {
  return await db.sumCostSince(monthStart(now));
}

/**
 * §3.5 point 7: the saved-page result's rows, each with the picture of its interchange group (so S1 can show the
 * thumbnail and the state, also for a row that was already on file). Rows whose number has no picture get null.
 */
export async function withSavedPagePictures(
  supabase: SupabaseClient,
  result: Record<string, unknown> | null | undefined,
  blockers: PictureBlockers,
  db: PartPictureAdminDb = createPartPictureAdminDb(supabase),
): Promise<Record<string, unknown> | null | undefined> {
  if (!result || !Array.isArray(result.rows)) return result;
  const rows = result.rows as Array<Record<string, unknown>>;
  const numbers = rows.map((row) => String(row.number ?? "")).filter(Boolean);
  if (!numbers.length) return { ...result, rows: rows.map((row) => ({ ...row, picture: null })) };

  const groupByNumber = await db.interchangeGroupsForNumbers(numbers);
  const pictures = await db.picturesByGroupIds([...new Set(groupByNumber.values())]);
  const pictureByGroup = new Map(pictures.map((picture) => [picture.interchange_group_id, picture]));
  const shaped = await shapePictures(db, pictures, blockers);
  const dtoById = new Map(shaped.map((dto) => [dto.id, dto]));

  return {
    ...result,
    rows: rows.map((row) => {
      const groupId = groupByNumber.get(norm(String(row.number ?? "")));
      const picture = groupId ? pictureByGroup.get(groupId) : undefined;
      return { ...row, picture: picture ? (dtoById.get(picture.id) ?? null) : null };
    }),
  };
}
