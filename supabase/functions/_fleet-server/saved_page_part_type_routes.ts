/**
 * R5, R6 and R11 (docs/part-type-learning-audit.md §3): one button adds a part type from a saved page.
 *
 * POST /admin/catalog-research/saved-pages/:id/part-type  { key, action: "add" | "dismiss", name?, groupId? }
 * GET  /admin/catalog-research/hidden-part-type-phrases           the owner's "not a part we track" list
 * DELETE /admin/catalog-research/hidden-part-type-phrases/:id     "Suggest again"
 *
 * Owner only. Add creates the type through the same function the Part types screen uses, proves the rows again for the
 * one check that waited (P4 — the type's own words), saves each axle through the normal save path with the page's own
 * dates, queues pictures from the drawings the upload kept, and answers the whole page so the screen redraws from one
 * reply. A failure part-way keeps the suggestion open with its `typeId`, so pressing Add again continues from that type
 * and never makes a second one.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { guardRead, guardWrite } from "./catalog_research_routes.ts";
import { hasPlatformOwnerAccess, type RbacUser } from "./rbac_middleware.ts";
import { answersGate, type CarBuild, type CheckAnswers } from "./research_browser_check.ts";
import { identityTokens } from "./research_part_job.ts";
import { savePartAnswers, type SaveJob } from "./research_part_save.ts";
import {
  PLACE_AXLE_REASON,
  PLACE_SIDE_REASON,
  type PartType,
  rowNamesType,
} from "./saved_page_proof.ts";
import { existingTypeFor, type Suggestion } from "./saved_page_suggest.ts";
import { normalisePhrase, parseGroupPhrase } from "./saved_page_phrases.ts";
import { loadPageDrawings, type SavedPageDiagramStore } from "./saved_page_diagrams.ts";
import {
  type PartPictureQueueDeps,
  type PartPictureQueueRow,
  type PicturesResult,
  queuePartPictures,
} from "./part_pictures_queue.ts";
import type { PictureBlockers } from "./part_picture_reads.ts";
import {
  loadSavedPageAnswer,
  productionPictureDeps,
  type ResultRow,
  SAVED_PAGE_ID,
  SAVED_PAGE_PREFIX,
  type SavedPageAnswer,
  type SavedPageResult,
  type SavedPageRow,
  savedPageBuildText,
} from "./research_saved_page_routes.ts";
import { type OnFile, overlaps, parseOnFile, placeMatches, POSITION_SCHEMES } from "./saved_page_on_file.ts";
import { readPartGroups } from "./parts_catalog_read.ts";

const SIDED = new Set(["four_corners", "axle_left_right"]);
const OWNER_ONLY = "Only the owner can add a part type";

type RbacCtx = { id?: string; userId?: string; resolvedRole?: string; rawRole?: string };

export type SavedPagePartTypeDeps = {
  /** R7: the picture queue. Undefined = the live one; null = skip pictures (tests, or pictures off). */
  pictures?: PartPictureQueueDeps | null;
  /** The picture blockers the page answer is decorated with (tests pass a fixed set). */
  pictureBlockers?: () => Promise<PictureBlockers>;
};

type RowState = { state: "saved" | "already" | "held"; reason: string | null; jobId: string | null };

const norm = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** D1's ISO day back to the month index the save path uses (2016-11-01 → 11.2016). */
function monthIndexFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear() * 12 + d.getUTCMonth() + 1;
}

/** The place a kept row was proved for, from D1's `place` words ("front left"). */
function placeOf(row: ResultRow): { axle: "front" | "rear" | null; side: "left" | "right" | "both" | null } {
  const words = String(row.place ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const axle = words.includes("front") ? "front" : words.includes("rear") ? "rear" : null;
  const side = words.includes("left") ? "left" : words.includes("right") ? "right" : words.includes("both") ? "both" : null;
  return { axle, side };
}

function opCodeBase(name: string): string {
  return String(name ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

/** R5 step 3: the name as an op code, then `_2`, `_3`… — unique against every row's op_code AND the code it becomes. */
export function uniqueOpCode(name: string, taken: ReadonlySet<string>): string {
  const base = opCodeBase(name) || "PART_TYPE";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate.toUpperCase()) || taken.has(candidate.toLowerCase())) {
    candidate = `${base}_${n}`;
    n += 1;
  }
  return candidate;
}

type LiveType = PartType & { part_type_status?: string | null; kind?: string | null; is_part?: boolean | null };

async function readLiveTypes(supabase: SupabaseClient): Promise<LiveType[]> {
  const { data, error } = await supabase.from("maintenance_service_categories")
    .select("id, name, position_scheme, part_type_status, kind, is_part")
    .eq("kind", "component").eq("is_part", true).eq("part_type_status", "active")
    .order("name").limit(500);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    scheme: row.position_scheme != null ? String(row.position_scheme) : null,
  }));
}

/** Every op_code and code on file, so a generated op code is unique across all rows (not only part types). */
async function readTakenCodes(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("maintenance_service_categories").select("op_code, code").limit(2000);
  if (error) throw error;
  const taken = new Set<string>();
  for (const row of (data ?? []) as Array<{ op_code: string | null; code: string | null }>) {
    if (row.op_code) taken.add(String(row.op_code).toUpperCase());
    if (row.code) taken.add(String(row.code));
  }
  return taken;
}

async function readCar(supabase: SupabaseClient, id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from("vehicle_catalog")
    .select("id, make, model, chassis_code, engine_code, trim_series, catalog_trim, transmission, production_start_year, production_start_month, production_end_year, production_end_month")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

/** The version Roam remembers for this car on this site (R4 stored it when the page was read). */
async function rememberedVersion(supabase: SupabaseClient, carId: string, domain: string | null): Promise<string | null> {
  let query = supabase.from("research_car_site_version").select("version_code").eq("vehicle_catalog_id", carId);
  if (domain) query = query.eq("domain", domain);
  const { data, error } = await query.order("confirmed_at", { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as Array<{ version_code: string | null }>)[0]?.version_code ?? null;
}

async function carMakerPage(supabase: SupabaseClient, domain: string | null, make: string | null): Promise<boolean> {
  if (!domain) return false;
  const { data, error } = await supabase.from("trusted_source").select("kind, maker_norm").eq("domain", domain);
  if (error) throw error;
  const wanted = String(make ?? "").trim().toLowerCase();
  return ((data ?? []) as Array<{ kind: string; maker_norm: string | null }>)
    .some((t) => t.kind === "car_maker" && String(t.maker_norm ?? "").toLowerCase() === wanted);
}

async function confirmedOnFile(supabase: SupabaseClient, carId: string): Promise<OnFile[]> {
  const { data, error } = await supabase.from("part_listing")
    .select("position, side, year_from, year_to, part_interchange_group ( part_master ( oem_part_number, maintenance_component_id ) )")
    .eq("vehicle_catalog_id", carId).eq("trust", "confirmed").limit(2000);
  if (error) throw error;
  return parseOnFile(data);
}

export type AddPartTypeInput = {
  savedPageId: string;
  body: { key?: unknown; action?: unknown; name?: unknown; groupId?: unknown };
  actor: string | null;
  owner: boolean;
  deps?: SavedPagePartTypeDeps;
};

export type AddPartTypeOutcome =
  | { kind: "error"; status: number; error: string }
  | { kind: "answer"; answer: SavedPageAnswer };

/** The page's stored result, with the suggestion list defaulted for a result written before this round. */
function resultOf(row: SavedPageRow): SavedPageResult {
  const result = (row.result ?? {}) as SavedPageResult;
  return { ...result, rows: result.rows ?? [], suggestions: result.suggestions ?? [] };
}

function plainError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message && message.length <= 200 ? message : "That didn't work. Try again.";
}

/** The words a page phrase is checked by, upper case, 3+ characters — the same rule P4 uses for a type's name. */
function wordsOf(text: string | null | undefined): string[] {
  return String(text ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter((word) => word.length >= 3);
}

function lineHasWord(text: string | null | undefined, word: string): boolean {
  return new RegExp(`(^|[^A-Z0-9])${word}([^A-Z0-9]|$)`).test(String(text ?? "").toUpperCase());
}

/**
 * S1b fix 1: P4 at Add, for a card the owner renamed first (rule 11, §4b).
 *
 * The type's own words are checked as before; the row also passes when its group line carries the suggestion's page
 * phrase — the words the suggestion was built from and the synonym this Add just wrote. Renaming "Air cleaner inlet"
 * to "Breather tube" must not hold rows whose page still says "INLET, AIR CLEANER, NO.1".
 */
function rowNamesSuggestedPart(
  type: PartType,
  make: string | null,
  row: ResultRow,
  pagePhrase: string,
): boolean {
  if (rowNamesType(type, make, row.groupLine, row.lineText)) return true;
  const groupLine = String(row.groupLine ?? "");
  return wordsOf(pagePhrase).some((word) => lineHasWord(groupLine, word));
}

/** The plain words a held row gets when the page doesn't name the part type (shared by the check and the settle rule). */
const NO_TYPE_WORDS_REASON = "The page doesn't name this part type on that row";

/**
 * S1b fix 2: a held reason a second press can never change, because it is a fact about the page — not a failed call.
 * Those rows stay held with Check this part, and the card becomes "added" even when nothing was saved.
 */
function isPageHeldReason(reason: string | null): boolean {
  if (!reason) return false;
  if (reason === NO_TYPE_WORDS_REASON) return true;
  if (reason === PLACE_AXLE_REASON || reason === PLACE_SIDE_REASON) return true;
  if (reason === "No part number on that row") return true;
  return /^Roam already has .+ for these years$/.test(reason);
}

function mergePictures(base: PicturesResult | null | undefined, add: PicturesResult): PicturesResult {
  if (!base) return add;
  return {
    queued: base.queued + add.queued,
    alreadyHave: base.alreadyHave + add.alreadyHave,
    noDiagram: base.noDiagram + add.noDiagram,
    failed: base.failed || add.failed,
    rows: [...base.rows, ...add.rows],
  };
}

type RowPatch = Partial<Pick<ResultRow, "partType" | "group" | "reason" | "jobId">>;

type ResultPatch = {
  /** The suggestion's own fields, given the suggestion as it is stored right now. */
  suggestion: (stored: Suggestion) => Partial<Suggestion>;
  /** The rows to change, by line number. Only this suggestion's own rows are touched. */
  rows: Map<number, RowPatch>;
  /** Pictures this press queued, added to the page's own tally rather than replacing it. */
  pictures?: PicturesResult;
};

/**
 * S1b fix 3: write this suggestion's own changes onto the result as it is stored *now*, never onto the copy this
 * request read at its start.
 *
 * Two presses at once must never undo each other: the second press fails on the unique code and its write would
 * otherwise put the suggestion back to "open" over the first press's "added". The write is skipped when the suggestion
 * is no longer open, and only this suggestion and its own rows are ever changed.
 */
async function writeSuggestionPatch(
  supabase: SupabaseClient,
  pageId: string,
  key: string,
  patch: ResultPatch,
): Promise<void> {
  const { data, error } = await supabase.from("research_saved_page")
    .select("id, result").eq("id", pageId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;
  const current = resultOf(data as SavedPageRow);
  const stored = (current.suggestions ?? []).find((s) => s.key === key) ?? null;
  if (!stored || stored.status !== "open") return;
  Object.assign(stored, patch.suggestion(stored));
  const rows = (current.rows ?? []).map((row) => {
    if (row.suggestion !== key) return row;
    const change = patch.rows.get(row.lineNo);
    return change ? { ...row, ...change } : row;
  });
  const counts = { saved: 0, already: 0, held: 0, not_roam_type: 0 };
  for (const row of rows) counts[row.group] += 1;
  const next: SavedPageResult = { ...current, rows, counts, suggestions: current.suggestions };
  if (patch.pictures) next.pictures = mergePictures(current.pictures, patch.pictures);
  const { error: writeError } = await supabase.from("research_saved_page").update({ result: next }).eq("id", pageId);
  if (writeError) throw new Error(writeError.message);
}

/**
 * R5 Add / R6 Dismiss. Answers the whole page on success and on a part-way failure, so the screen always redraws from
 * the server's own result; only the plan's own checks answer with a status code.
 */
export async function addSuggestedPartType(
  supabase: SupabaseClient,
  input: AddPartTypeInput,
): Promise<AddPartTypeOutcome> {
  const deps = input.deps ?? {};
  const actor = input.actor;

  // 1. Owner only.
  if (!input.owner) return { kind: "error", status: 403, error: OWNER_ONLY };

  // 2. The upload exists and is done.
  const { data: pageData, error: pageError } = await supabase.from("research_saved_page")
    .select("id, vehicle_catalog_id, job_id, domain, source_url, file_name, status, stop_reason, result, created_at")
    .eq("id", input.savedPageId).maybeSingle();
  if (pageError) return { kind: "error", status: 500, error: pageError.message };
  const page = pageData as SavedPageRow | null;
  if (!page || page.status !== "done") return { kind: "error", status: 404, error: "That upload isn't ready" };

  const answer = async (): Promise<AddPartTypeOutcome> => {
    const fresh = await loadSavedPageAnswer(supabase, page.id, deps.pictureBlockers);
    if (fresh) return { kind: "answer", answer: fresh };
    // The page was removed while the request ran. Answer the row we read, still without the uploader (RE-23).
    const { uploaded_by: _uploader, ...rest } = page;
    return { kind: "answer", answer: { savedPage: rest } };
  };
  const result = resultOf(page);
  const key = String(input.body?.key ?? "").trim();
  // 3. The suggestion exists and is open: pressing twice answers the page unchanged.
  const suggestion = (result.suggestions ?? []).find((s) => s.key === key) ?? null;
  if (!suggestion || suggestion.status !== "open") return await answer();

  // R6: "not a part we track" — remembered by phrase, for every page and every car, until the owner brings it back.
  if (String(input.body?.action ?? "") === "dismiss") {
    const phrase = String(suggestion.pagePhrase ?? "").trim();
    const phraseKey = normalisePhrase(phrase);
    if (!phraseKey) return await answer();
    const { error } = await supabase.from("part_type_suggestion_dismissal").upsert({
      phrase_key: phraseKey,
      phrase,
      group_id: suggestion.groupId,
      dismissed_by: actor,
      note: null,
    }, { onConflict: "phrase_key", ignoreDuplicates: true });
    if (error) return { kind: "error", status: 500, error: error.message };
    try {
      await writeSuggestionPatch(supabase, page.id, suggestion.key, {
        suggestion: () => ({ status: "dismissed", reason: null }),
        rows: new Map(),
      });
    } catch (err) {
      return { kind: "error", status: 500, error: plainError(err) };
    }
    return await answer();
  }

  // 4. The name, from the screen else from the suggestion. 3–60 characters.
  const wantedName = String(input.body?.name ?? "").trim();
  const name = wantedName || String(suggestion.name ?? "").trim();
  if (name.length < 3 || name.length > 60) return { kind: "error", status: 400, error: "Give the part type a name" };

  // 5. The part group, from the screen else from the suggestion; it must be one of the groups on file.
  const groups = await readPartGroups(supabase);
  const wantedGroupId = String(input.body?.groupId ?? "").trim();
  const groupId = wantedGroupId || String(suggestion.groupId ?? "");
  const group = groups.find((g) => g.id === groupId) ?? null;
  if (!group) return { kind: "error", status: 400, error: "Choose a part group" };

  // 6. Fixings are never part types (PT-05).
  if (suggestion.kind === "fixings") {
    return { kind: "error", status: 400, error: "Fixings aren't parts Roam tracks" };
  }

  // The suggestion's own rows, and what the page wrote for them (D1).
  const rows = (result.rows ?? []).filter((row) => row.suggestion === suggestion.key);
  const phrase = String(suggestion.pagePhrase ?? "");
  const parsed = parseGroupPhrase(phrase);

  let type: LiveType | null = null;
  let created = false;

  // 2 (R5). Duplicate: a type that already covers this part is used and nothing is created. A part-way type from an
  // earlier press (typeId kept) is continued, never duplicated.
  try {
    const live = await readLiveTypes(supabase);
    if (suggestion.typeId) {
      type = live.find((t) => t.id === suggestion.typeId) ?? null;
    }
    if (!type) {
      const byName = live.find((t) => t.name.trim().toLowerCase() === name.toLowerCase()) ?? null;
      type = byName ?? (parsed ? existingTypeFor(parsed.baseName, live) : null);
    }

    // 3 (R5). Create the type through the same function the Part types screen uses.
    if (!type) {
      const taken = await readTakenCodes(supabase);
      const opCode = uniqueOpCode(name, taken);
      const { data, error } = await supabase.rpc("upsert_self_serve_part_type", {
        p_input: {
          areaId: group.id,
          name,
          opCode,
          defaultFitMode: "specific",
          positionScheme: suggestion.positionScheme,
          status: "active",
        },
      });
      if (error) throw new Error(error.message);
      const createdId = String((data as { id?: string } | null)?.id ?? "");
      if (!createdId) throw new Error("The part type wasn't saved. Try again.");
      const { data: made, error: madeError } = await supabase.from("maintenance_service_categories")
        .select("id, name, position_scheme").eq("id", createdId).maybeSingle();
      if (madeError) throw new Error(madeError.message);
      const row = made as Record<string, unknown> | null;
      type = {
        id: createdId,
        name: String(row?.name ?? name),
        scheme: row?.position_scheme != null ? String(row.position_scheme) : suggestion.positionScheme,
      };
      created = true;
    }

    // 4 (R5). The synonym, with the page's own words, so Fleet finds the type by them (PT-17 / R9).
    const term = phrase.trim().toLowerCase();
    if (term && type) {
      const { error } = await supabase.from("part_term_synonym").upsert({
        term,
        canonical: type.name,
        maintenance_component_id: type.id,
      }, { onConflict: "term", ignoreDuplicates: true });
      if (error) console.warn("part type synonym not written", error.message);
    }
  } catch (err) {
    // Nothing was saved: the card shows the plain reason and Try again. The suggestion stays open — unless another
    // press already finished it, in which case this patch is skipped and that press's answer stands.
    try {
      await writeSuggestionPatch(supabase, page.id, key, {
        suggestion: () => ({ reason: plainError(err) }),
        rows: new Map(),
      });
    } catch { /* the answer below still shows the page as stored */ }
    return await answer();
  }

  if (!type) return { kind: "error", status: 500, error: "The part type wasn't saved. Try again." };

  // 5–7 (R5): prove each row again for the new type, then save each axle through the same path the upload uses.
  const car = await readCar(supabase, page.vehicle_catalog_id);
  if (!car) return { kind: "error", status: 404, error: "That car isn't on file" };
  const make = car.make == null ? null : String(car.make);
  const build: CarBuild = {
    startYear: car.production_start_year == null ? null : Number(car.production_start_year),
    startMonth: car.production_start_month == null ? null : Number(car.production_start_month),
    endYear: car.production_end_year == null ? null : Number(car.production_end_year),
    endMonth: car.production_end_month == null ? null : Number(car.production_end_month),
  };
  const domain = page.domain ?? null;
  const version = await rememberedVersion(supabase, page.vehicle_catalog_id, domain).catch(() => null);
  const fromCarMaker = await carMakerPage(supabase, domain, make).catch(() => false);
  const onFile = await confirmedOnFile(supabase, page.vehicle_catalog_id).catch(() => [] as OnFile[]);
  const identity = identityTokens(car as unknown as Record<string, string>);
  const buildText = savedPageBuildText(car);
  const site = domain ?? "";
  const url = page.source_url ?? "";

  type Decision = RowState & {
    row: ResultRow;
    axle: "front" | "rear" | null;
    side: "left" | "right" | "both" | null;
    fromMonth: number | null;
    toMonth: number | null;
  };
  const decisions: Decision[] = [];

  for (const row of rows) {
    const { axle, side } = placeOf(row);
    const fromMonth = monthIndexFromIso(row.from);
    const toMonth = monthIndexFromIso(row.to);
    const held = (reason: string): Decision => ({ row, state: "held", reason, jobId: null, axle, side, fromMonth, toMonth });
    const base = { row, axle, side, fromMonth, toMonth };

    // P4 — the check that waited: the type's own words, or the suggestion's page phrase when the card was renamed.
    if (!rowNamesSuggestedPart(type, make, row, phrase)) {
      decisions.push(held(NO_TYPE_WORDS_REASON));
      continue;
    }
    // A position-aware type needs the page to say the place (the same plain words a known row gets).
    if (POSITION_SCHEMES.has(String(type.scheme ?? ""))) {
      if (!axle) {
        decisions.push(held(PLACE_AXLE_REASON));
        continue;
      }
      if (SIDED.has(String(type.scheme ?? "")) && !side) {
        decisions.push(held(PLACE_SIDE_REASON));
        continue;
      }
    }
    // Already on file, or a different number for the same years on this car (the upload's own two checks, re-run).
    const number = String(row.number ?? "").trim();
    const hits = onFile.filter((a) => a.componentId === type!.id && placeMatches(a, { type, axle, side }));
    const same = hits.find((a) => norm(a.number) === norm(number)) ?? null;
    if (same) {
      decisions.push({ ...base, state: "already", reason: null, jobId: null });
      continue;
    }
    const other = hits.find((a) => norm(a.number) !== norm(number) && overlaps(a, { from: fromMonth, to: toMonth })) ?? null;
    if (other) {
      decisions.push(held(`Roam already has ${other.number} for these years`));
      continue;
    }
    if (!number) {
      decisions.push(held("No part number on that row"));
      continue;
    }
    decisions.push({ ...base, state: "saved", reason: null, jobId: null });
  }

  // One job per axle; both sides of an axle always save together (SP-24).
  const byAxle = new Map<string, Decision[]>();
  for (const d of decisions) {
    if (d.state !== "saved") continue;
    const k = d.axle ?? "";
    byAxle.set(k, [...(byAxle.get(k) ?? []), d]);
  }

  let lastReason: string | null = null;

  for (const [axleKey, groupRows] of byAxle) {
    const axle = axleKey === "front" || axleKey === "rear" ? axleKey : null;
    const jobResult = await supabase.rpc("research_saved_page_job", {
      p_vehicle_catalog_id: page.vehicle_catalog_id,
      p_component_id: type.id,
      p_axle: axle,
      p_actor: actor,
    });
    if (jobResult.error) {
      for (const d of groupRows) {
        d.state = "held";
        d.reason = "The browser check couldn't open. Try again.";
      }
      lastReason = lastReason ?? "The browser check couldn't open. Try again.";
      continue;
    }
    const jr = jobResult.data as { jobId?: string; state?: string; busy?: boolean } | null;
    if (jr?.busy) {
      for (const d of groupRows) {
        d.state = "held";
        d.reason = "Roam is checking this part now. Try again in a few minutes.";
      }
      lastReason = lastReason ?? "Roam is checking this part now. Try again in a few minutes.";
      continue;
    }
    const jobId = jr?.jobId ? String(jr.jobId) : "";
    if (!jobId) {
      for (const d of groupRows) {
        d.state = "held";
        d.reason = "The browser check couldn't open. Try again.";
      }
      lastReason = lastReason ?? "The browser check couldn't open. Try again.";
      continue;
    }

    const datesOf = (d: Decision) =>
      d.fromMonth == null
        ? null
        : {
          fromMonth: ((d.fromMonth - 1) % 12) + 1,
          fromYear: Math.floor((d.fromMonth - 1) / 12),
          toMonth: d.toMonth == null ? null : ((d.toMonth - 1) % 12) + 1,
          toYear: d.toMonth == null ? null : Math.floor((d.toMonth - 1) / 12),
        };
    const numbers: NonNullable<CheckAnswers["numbers"]> = [];
    for (const d of groupRows) {
      const value = String(d.row.number ?? "");
      // A row proved for both sides saves once per side; the save path groups them into one listing with side "both".
      const sides = d.side === "both" ? (["left", "right"] as const) : [d.side];
      for (const side of sides) {
        numbers.push({ axle: d.axle, side, value, valueAgain: value, dates: datesOf(d) });
      }
    }

    const { data: suggestionRows } = await supabase.from("catalog_part_proposal").select("part_number")
      .eq("job_id", jobId).eq("status", "open");
    const suggestionsForGate = ((suggestionRows ?? []) as Array<{ part_number: string | null }>)
      .map((p) => String(p.part_number ?? "").trim()).filter(Boolean);

    const gate = answersGate({
      jobType: "part",
      answers: { versionOk: true, versionCode: version, partFound: true, datesOk: true, numbers },
      identity,
      frame: car.chassis_code == null ? null : String(car.chassis_code),
      site,
      rowName: type.name,
      buildText,
      knownCode: version,
      suggestions: suggestionsForGate,
      positionScheme: type.scheme,
      jobAxle: axle,
      build,
    });
    if (!gate.ok) {
      for (const d of groupRows) {
        d.state = "held";
        d.reason = "Roam couldn't save these numbers together. Use the browser check.";
      }
      lastReason = lastReason ?? "Roam couldn't save these numbers together. Use the browser check.";
      continue;
    }

    const { data: jobRow } = await supabase.from("catalog_research_job")
      .select("id, job_type, state, vehicle_catalog_id, maintenance_component_id, spec_key, fit_descriptor")
      .eq("id", jobId).maybeSingle();
    if (!jobRow) {
      for (const d of groupRows) {
        d.state = "held";
        d.reason = "The browser check is gone. Refresh the page.";
      }
      lastReason = lastReason ?? "The browser check is gone. Refresh the page.";
      continue;
    }

    const evidence = [...new Set(groupRows.map((d) => `${d.row.groupLine ?? ""}\n${d.row.lineText}`.trim()))].join("\n");
    const saved = await savePartAnswers(supabase, jobId, {
      job: jobRow as SaveJob,
      car: car as Record<string, string | null>,
      host: site,
      carMakerPage: fromCarMaker,
      detected: String(groupRows[0]?.row.number ?? ""),
      versionCode: version,
      items: gate.items ?? null,
      actor,
    }, url, evidence, page.id);
    const savedNumbers = new Set((saved.ok ? saved.results : saved.saved).map((r) => norm(r.number)));
    for (const d of groupRows) {
      d.jobId = jobId;
      if (savedNumbers.has(norm(String(d.row.number ?? "")))) {
        d.state = "saved";
        d.reason = null;
      } else {
        d.state = "held";
        d.reason = saved.ok ? "Roam couldn't save this number." : saved.error;
        lastReason = lastReason ?? d.reason;
      }
    }
  }

  // R5 step 9 + S1b fix 2: the rows move out of "Roam doesn't know", and the card is "added" once the type exists and
  // every row reached a final answer — saved, already on file, or held because of the page itself (its place words, a
  // number already on file). Those rows show Check this part ("Added, needs you"). The card stays open with a reason
  // only for a failure a second press can fix: the browser check couldn't open, Roam is checking it now, the gate
  // refused, or the save errored.
  const everyRowFinal = decisions.every((d) =>
    d.state === "saved" || d.state === "already" || isPageHeldReason(d.reason)
  );
  const rowPatches = new Map<number, RowPatch>(
    decisions.map((d) => [
      d.row.lineNo,
      {
        partType: type!.name,
        group: d.state,
        reason: d.state === "held" ? d.reason : null,
        jobId: d.jobId,
      },
    ]),
  );

  // 8 (R5): pictures for the added parts, from the drawings this upload kept (D4). Best effort.
  const pictureDeps = deps.pictures === undefined ? null : deps.pictures;
  let queuedPictures: PicturesResult | undefined;
  if (pictureDeps && everyRowFinal) {
    try {
      const queueRows: PartPictureQueueRow[] = decisions
        .filter((d) => d.state === "saved" || d.state === "already")
        .map((d) => ({
          number: String(d.row.number ?? ""),
          lineNo: d.row.lineNo,
          groupLine: d.row.groupLine,
          componentId: type!.id,
        }));
      const drawings = await loadPageDrawings(supabase, {
        savedPageId: page.id,
        r2: pictureDeps.r2 as SavedPageDiagramStore | null,
      });
      const queued = await queuePartPictures(supabase, {
        drawings,
        savedPageId: page.id,
        carMake: make,
        rows: queueRows,
      }, pictureDeps);
      if (queued) queuedPictures = queued;
    } catch (err) {
      console.error("part type pictures not queued", err);
    }
  }

  try {
    await writeSuggestionPatch(supabase, page.id, suggestion.key, {
      suggestion: () =>
        everyRowFinal
          ? { status: "added", typeId: type!.id, typeName: type!.name, reason: null }
          : {
            status: "open",
            typeId: type!.id,
            typeName: type!.name,
            reason: lastReason ?? "Roam couldn't save these parts. Try again.",
          },
      rows: rowPatches,
      ...(queuedPictures ? { pictures: queuedPictures } : {}),
    });
  } catch (err) {
    return { kind: "error", status: 500, error: plainError(err) };
  }
  return await answer();
}

// ---------------------------------------------------------------- routes

function isOwner(c: Context): boolean {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return !!user && hasPlatformOwnerAccess(user);
}

function actorOf(c: Context): string | null {
  const user = c.get("rbacUser") as RbacCtx | undefined;
  return user?.id ?? user?.userId ?? null;
}

/** The owner's name, best effort (never a reason to fail a list). No email fallback: the hidden list shows a name. */
async function staffName(supabase: SupabaseClient, id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    const { data } = await supabase.auth.admin.getUserById(id);
    const user = (data as { user?: { user_metadata?: Record<string, unknown> } } | null)?.user;
    const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
    return String(meta.full_name || meta.name || "").trim() || null;
  } catch {
    return null;
  }
}

export function registerSavedPagePartTypeRoutes(
  app: { get: Function; post: Function; delete?: Function },
  supabase: SupabaseClient,
  deps: SavedPagePartTypeDeps = {},
) {
  // R5 step 8: live pictures unless a caller says otherwise (a test passes null, and pictures are then skipped).
  const routeDeps: SavedPagePartTypeDeps = {
    ...deps,
    pictures: deps.pictures === undefined ? productionPictureDeps() : deps.pictures,
  };
  // R5 / R6: one button, owner only. The plan's first check is the owner, so it answers its own plain line.
  app.post(`${SAVED_PAGE_PREFIX}/saved-pages/:id/part-type`, async (c: Context) => {
    if (!isOwner(c)) return c.json({ error: OWNER_ONLY }, 403);
    const denied = guardWrite(c);
    if (denied) return denied;
    const id = c.req.param("id") ?? "";
    if (!SAVED_PAGE_ID.test(id)) return c.json({ error: "Bad id" }, 400);
    let body: Record<string, unknown> = {};
    try {
      body = await c.req.json() as Record<string, unknown>;
    } catch {
      body = {};
    }
    let outcome: AddPartTypeOutcome;
    try {
      outcome = await addSuggestedPartType(supabase, {
        savedPageId: id,
        body,
        actor: actorOf(c),
        owner: true, // checked above, before the write permission
        deps: routeDeps,
      });
    } catch (err) {
      console.error("add part type failed", err);
      return c.json({ error: "That didn't work. Try again." }, 500);
    }
    if (outcome.kind === "error") return c.json({ error: outcome.error }, outcome.status as 400);
    return c.json(outcome.answer);
  });

  // R11: the owner's "not a part we track" list (S2's Hidden from saved pages).
  app.get(`${SAVED_PAGE_PREFIX}/hidden-part-type-phrases`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    if (!isOwner(c)) return c.json({ error: "Owner only" }, 403);
    const { data, error } = await supabase.from("part_type_suggestion_dismissal")
      .select("id, phrase, group_id, dismissed_by, dismissed_at")
      .order("dismissed_at", { ascending: false })
      .limit(200);
    if (error) return c.json({ error: error.message }, 500);
    const rows = (data ?? []) as Array<{
      id: string;
      phrase: string;
      group_id: string | null;
      dismissed_by: string | null;
      dismissed_at: string;
    }>;
    const groupIds = [...new Set(rows.map((row) => row.group_id).filter((v): v is string => Boolean(v)))];
    const groupNames = new Map<string, string>();
    if (groupIds.length) {
      const { data: groups, error: groupError } = await supabase.from("maintenance_service_categories")
        .select("id, name").in("id", groupIds);
      if (groupError) return c.json({ error: groupError.message }, 500);
      for (const g of (groups ?? []) as Array<{ id: string; name: string }>) groupNames.set(String(g.id), String(g.name));
    }
    const names = new Map<string, string | null>();
    for (const row of rows) {
      if (!row.dismissed_by || names.has(row.dismissed_by)) continue;
      names.set(row.dismissed_by, await staffName(supabase, row.dismissed_by));
    }
    return c.json({
      items: rows.map((row) => ({
        id: row.id,
        phrase: row.phrase,
        groupId: row.group_id,
        groupName: row.group_id ? groupNames.get(row.group_id) ?? null : null,
        dismissedBy: row.dismissed_by,
        dismissedByName: row.dismissed_by ? names.get(row.dismissed_by) ?? null : null,
        dismissedAt: row.dismissed_at,
      })),
    });
  });

  // R11: "Suggest again" — delete one dismissal, so the phrase can be suggested on the next page.
  const suggestAgain = async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    if (!isOwner(c)) return c.json({ error: "Owner only" }, 403);
    const id = c.req.param("id") ?? "";
    if (!SAVED_PAGE_ID.test(id)) return c.json({ error: "Bad id" }, 400);
    const { error } = await supabase.from("part_type_suggestion_dismissal").delete().eq("id", id);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ deleted: id });
  };
  if (app.delete) app.delete(`${SAVED_PAGE_PREFIX}/hidden-part-type-phrases/:id`, suggestAgain);
}
