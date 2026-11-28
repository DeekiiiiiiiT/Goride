/**
 * Answers teach Roam (docs/answers-teach-roam-audit.md AT-04 / AT-05 / AT-08 / AT-09 / AT-11).
 *
 *   POST   …/saved-pages/:id/rows/:lineNo/answer   the owner answers one question card
 *   GET    …/lessons                               "Learned from you" (staff read, owner rows only)
 *   DELETE …/lessons/:id                           Undo one lesson (owner)
 *
 * An answer applies to every row on the page with the same heading (both sides, every date range), remembers the lesson
 * first, then saves those rows through the same stored-row save the "Add part type" path uses (saveRowsAsPartType →
 * research_saved_page_job → savePartAnswers), so RE-73/74/75 and the page's own checks still apply.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { guardRead, guardWrite } from "./catalog_research_routes.ts";
import { hasPlatformOwnerAccess, type RbacUser } from "./rbac_middleware.ts";
import { type ResultRow, SAVED_PAGE_PREFIX, type SavedPageResult } from "./research_saved_page_routes.ts";
import { saveRowsAsPartType } from "./saved_page_part_type_core.ts";
import { countRowsByGroup } from "./saved_page_result.ts";
import { countLessonSaves, headingKey, lessonPhrase, rememberAnswer } from "./saved_page_lessons.ts";
import { pagePhraseFromGroupLine } from "./saved_page_phrases.ts";
import { POSITION_SCHEMES } from "./saved_page_on_file.ts";

const SIDED = new Set(["four_corners", "axle_left_right"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNER_ONLY = "Only the owner can answer this";
const SAVE_FAILED = "That didn't save. Try again.";
const OPEN_JOB_STATES = ["queued", "needs_review", "browser_check", "browser_check_queued"];

type Axle = "front" | "rear";
type Side = "left" | "right" | "both";
type Question = NonNullable<ResultRow["question"]>;

export type AnswerBody = {
  yes?: boolean;
  typeId?: string | null;
  axle?: Axle | null;
  side?: Side | null;
  /** Owner 27 Nov: "It has no front or rear" — the part type's place setting is wrong; it becomes "none". */
  noPlace?: boolean;
  /** Owner 27 Nov: "It has no left or right" — the part type keeps front/rear but has no sides. */
  noSide?: boolean;
};

/** The place setting a "no front or rear" / "no left or right" answer gives a part type. */
export function correctedScheme(scheme: string | null, body: AnswerBody): string | null {
  if (body.noPlace) return "none";
  if (body.noSide && (scheme === "axle_left_right" || scheme === "four_corners")) return "axle";
  return null;
}

export type AnswerOutcome =
  | { kind: "error"; status: number; error: string }
  | { kind: "done"; result: SavedPageResult; message: string | null };

function isOwner(c: Context): boolean {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return !!user && hasPlatformOwnerAccess(user);
}

function actorOf(c: Context): string | null {
  const user = c.get("rbacUser") as { id?: string; userId?: string } | undefined;
  return user?.id ?? user?.userId ?? null;
}

function placeOf(row: ResultRow): { axle: Axle | null; side: Side | null } {
  const words = String(row.place ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const axle = words.includes("front") ? "front" : words.includes("rear") ? "rear" : null;
  const side = words.includes("left") ? "left" : words.includes("right") ? "right" : words.includes("both") ? "both" : null;
  return { axle, side };
}

const placeText = (axle: Axle | null, side: Side | null) => [axle, side].filter(Boolean).join(" ") || null;

/** What an answer means for one question: the chosen part type, and the place it settles. Null = "No / Something else". */
export function readAnswer(
  q: Question,
  body: AnswerBody,
): { typeId: string; axle: Axle | null; side: Side | null } | null | "bad" {
  if (q.kind === "wording") {
    if (body.yes === true) return { typeId: q.typeIds[0], axle: null, side: null };
    if (body.yes === false) return null;
    return "bad";
  }
  if (q.kind === "types") {
    if (body.typeId == null || body.yes === false) return null;
    return q.typeIds.includes(String(body.typeId)) ? { typeId: String(body.typeId), axle: null, side: null } : "bad";
  }
  if (q.kind === "axle") {
    if (body.noPlace) return { typeId: q.typeIds[0], axle: null, side: null };
    return body.axle === "front" || body.axle === "rear" ? { typeId: q.typeIds[0], axle: body.axle, side: null } : "bad";
  }
  if (body.noSide) return { typeId: q.typeIds[0], axle: null, side: null };
  return body.side === "left" || body.side === "right" || body.side === "both"
    ? { typeId: q.typeIds[0], axle: null, side: body.side }
    : "bad";
}

/** What is still missing once this answer is in: front/rear for a type with axles, then the side for a sided type. */
export function nextQuestionKind(scheme: string | null, axle: Axle | null, side: Side | null): "axle" | "side" | null {
  if (!POSITION_SCHEMES.has(String(scheme ?? ""))) return null;
  if (!axle) return "axle";
  if (SIDED.has(String(scheme ?? "")) && !side) return "side";
  return null;
}

async function readResult(supabase: SupabaseClient, pageId: string) {
  const { data, error } = await supabase.from("research_saved_page")
    .select("id, vehicle_catalog_id, domain, source_url, result").eq("id", pageId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; vehicle_catalog_id: string; domain: string | null; source_url: string | null; result: SavedPageResult | null } | null;
}

/** Write row changes onto the result as stored *now* (never the copy read at the start), then recount. */
async function patchRows(
  supabase: SupabaseClient,
  pageId: string,
  patches: Map<number, Partial<ResultRow>>,
): Promise<SavedPageResult> {
  const page = await readResult(supabase, pageId);
  if (!page?.result) throw new Error("The saved page is gone");
  const rows = (page.result.rows ?? []).map((r) => {
    const p = patches.get(r.lineNo);
    return p ? { ...r, ...p } : r;
  });
  const counts = countRowsByGroup(rows);
  const next: SavedPageResult = { ...page.result, rows, counts, skipped: counts.left_for_later };
  const { error } = await supabase.from("research_saved_page").update({ result: next }).eq("id", pageId);
  if (error) throw new Error(error.message);
  return next;
}

export async function answerQuestion(
  supabase: SupabaseClient,
  input: { pageId: string; lineNo: number; body: AnswerBody; actor: string | null },
): Promise<AnswerOutcome> {
  const page = await readResult(supabase, input.pageId);
  if (!page?.result) return { kind: "error", status: 404, error: "That saved page isn't on file" };
  const row = (page.result.rows ?? []).find((r) => r.lineNo === input.lineNo) ?? null;
  const q = row?.question ?? null;
  if (!row || !q || q.answer) return { kind: "error", status: 409, error: "That question was already answered" };

  const read = readAnswer(q, input.body);
  if (read === "bad") return { kind: "error", status: 400, error: "Pick one of the answers" };

  // "No, it's something else": nothing saved, no lesson, no dismissal. The row stays a browser check on its job (AT-11).
  if (read === null) {
    const result = await patchRows(supabase, page.id, new Map([[row.lineNo, { question: { ...q, answer: "no" } }]]));
    // §5.4: the check is a plain browser check now, not "Needs you" (the list reads "Needs you" from this source).
    if (row.jobId) {
      await supabase.from("catalog_part_proposal").update({ sources: [] })
        .eq("job_id", row.jobId).contains("sources", [{ kind: "saved_page", savedPageId: page.id }]);
    }
    return { kind: "done", result, message: "Not saved. It's in Pending catalog as a browser check." };
  }

  const { data: typeRow } = await supabase.from("maintenance_service_categories")
    .select("id, name, position_scheme").eq("id", read.typeId).maybeSingle();
  if (!typeRow) return { kind: "error", status: 400, error: "That part type isn't on file" };
  const type = { id: String((typeRow as { id: string }).id), name: String((typeRow as { name: string }).name), scheme: (typeRow as { position_scheme?: string | null }).position_scheme ?? null };

  // Owner 27 Nov: "It has no front or rear" / "It has no left or right" corrects the part type's place setting, for every
  // car, so the wrong question is never asked again (Radiator hose was set up as front/rear).
  const fixedScheme = correctedScheme(type.scheme, input.body);
  if (fixedScheme && fixedScheme !== type.scheme) {
    const { error: schemeError } = await supabase.from("maintenance_service_categories")
      .update({ position_scheme: fixedScheme }).eq("id", type.id).eq("position_scheme", type.scheme);
    if (schemeError) return { kind: "error", status: 500, error: SAVE_FAILED };
    await supabase.from("dominion_audit_log").insert({
      actor: input.actor,
      action: "part_type_place_fix",
      table_name: "maintenance_service_categories",
      row_id: type.id,
      before: { position_scheme: type.scheme },
      after: { position_scheme: fixedScheme, why: input.body.noPlace ? "no front or rear" : "no left or right", savedPageId: page.id },
    });
    type.scheme = fixedScheme;
  }

  const { data: carRow } = await supabase.from("vehicle_catalog").select("make, model").eq("id", page.vehicle_catalog_id).maybeSingle();
  const make = (carRow as { make?: string | null } | null)?.make ?? null;
  const model = (carRow as { model?: string | null } | null)?.model ?? null;

  // The answer covers every row with this heading that is still waiting (both sides, every date range).
  const key = headingKey(row.groupLine);
  const siblings = (page.result.rows ?? []).filter((r) =>
    r.lineNo === row.lineNo ||
    (key && headingKey(r.groupLine) === key && (r.group === "held" || r.group === "left_for_later") && !r.question?.answer)
  );
  const placed = siblings.map((r) => {
    const p = placeOf(r);
    // A part with no front/rear keeps no place; a part with no sides keeps only its axle.
    if (input.body.noPlace) return { row: r, axle: null, side: null };
    if (input.body.noSide) return { row: r, axle: p.axle ?? read.axle, side: null };
    return { row: r, axle: p.axle ?? read.axle, side: p.side ?? read.side };
  });
  const me = placed.find((p) => p.row.lineNo === row.lineNo)!;

  // AT-04: remember first, so the save below already sees the lesson (and a failed save still keeps the answer).
  const wording = q.kind === "wording" || q.kind === "types";
  const remembered = await rememberAnswer(supabase, {
    groupLine: row.groupLine,
    make,
    model,
    typeId: type.id,
    wording,
    axle: read.axle,
    side: read.side,
    actor: input.actor,
  });
  if (!remembered.ok) console.warn("answer not remembered", remembered.error);

  // Still missing a place? Ask that next, on the same card (the part is settled now).
  const next = nextQuestionKind(type.scheme, me.axle, me.side);
  if (next) {
    const patches = new Map<number, Partial<ResultRow>>();
    for (const p of placed) {
      patches.set(p.row.lineNo, {
        partType: type.name,
        place: placeText(p.axle, p.side),
        // One card per heading: the next question sits on this row; the heading's other rows (the other side) wait on
        // it and are saved with it, so they never ask again on a card of their own.
        question: p.row.lineNo === row.lineNo
          ? { kind: next, typeIds: [type.id], typeNames: [type.name], answer: null }
          : null,
      });
    }
    const result = await patchRows(supabase, page.id, patches);
    return { kind: "done", result, message: null };
  }

  const rowsToSave: ResultRow[] = placed.map((p) => ({ ...p.row, partType: type.name, place: placeText(p.axle, p.side) }));
  let outcome;
  try {
    outcome = await saveRowsAsPartType(supabase, {
      page: { id: page.id, vehicle_catalog_id: page.vehicle_catalog_id, domain: page.domain, source_url: page.source_url },
      name: type.name,
      groupId: "",
      positionScheme: "none",
      phrase: pagePhraseFromGroupLine(row.groupLine),
      rows: rowsToSave,
      typeId: type.id,
      strict: true,
      // The lesson is already written (part_maker_word); the auto-sort's own answer table is never touched here.
      answer: { setBy: "owner", actor: input.actor, reason: null, write: false },
    });
  } catch (err) {
    console.error("answer save failed", err);
    return { kind: "error", status: 500, error: SAVE_FAILED };
  }
  if (!outcome.ok) {
    console.error("answer save refused", outcome.error);
    return { kind: "error", status: 500, error: SAVE_FAILED };
  }

  // The answered card's second line (Stitch screens 2 and 9), in the server's own words.
  const phrase = lessonPhrase(row.groupLine);
  const note = fixedScheme
    ? input.body.noPlace
      ? `Roam will remember a ${type.name.toLowerCase()} has no front or rear.`
      : `Roam will remember a ${type.name.toLowerCase()} has no left or right.`
    : !remembered.ok
    ? null
    : wording
    ? `Roam will remember '${phrase}' for ${make}.`
    : read.axle
    ? `Roam will remember this is at the ${read.axle} on a ${model}.`
    : `Roam will remember the side on a ${model}.`;
  const patches = new Map<number, Partial<ResultRow>>();
  let savedHere = 0;
  const savedJobs = new Set<string>();
  for (const d of outcome.decisions) {
    if (d.state === "saved") {
      savedHere += 1;
      if (d.jobId) savedJobs.add(d.jobId);
    }
    patches.set(d.row.lineNo, {
      partType: type.name,
      place: d.row.place,
      group: d.state,
      reason: d.state === "held" || d.state === "not_saved" ? d.reason : null,
      jobId: d.jobId,
      ...(d.state === "left_for_later" ? { waitReason: d.waitReason ?? null } : {}),
      question: d.row.lineNo === row.lineNo ? { ...q, answer: "yes", note } : null,
    });
  }
  // AT-08: every owner lesson for this heading on this car saved these parts: the ones just written, and an earlier
  // answer on the same card (the wording, when the place was asked next).
  if (savedHere && key && make) {
    const ids = new Set(remembered.ok ? remembered.ids : []);
    const { data: same } = await supabase.from("part_maker_word").select("id, make, model")
      .eq("phrase_key", key).eq("set_by", "owner");
    for (const w of (same ?? []) as Array<{ id: string; make: string | null; model: string | null }>) {
      if (String(w.make ?? "").toLowerCase() !== make.toLowerCase()) continue;
      if (w.model == null || String(w.model).toLowerCase() === String(model ?? "").toLowerCase()) ids.add(String(w.id));
    }
    await countLessonSaves(supabase, new Map([...ids].map((id) => [id, savedHere])));
  }

  // AT-11: the question's own browser check closes once its part saved on another job (e.g. it was opened with no axle).
  if (row.jobId && savedHere && !savedJobs.has(row.jobId)) {
    await supabase.from("catalog_research_job").update({ state: "added", updated_at: new Date().toISOString() })
      .eq("id", row.jobId).in("state", OPEN_JOB_STATES);
    await supabase.rpc("catalog_research_log_event", {
      p_job_id: row.jobId,
      p_step: "answer",
      p_outcome: "saved_elsewhere",
      p_detail: { savedPageId: page.id, lineNo: row.lineNo, jobs: [...savedJobs] },
      p_actor: input.actor,
    });
  }

  const result = await patchRows(supabase, page.id, patches);
  const mine = outcome.decisions.find((d) => d.row.lineNo === row.lineNo);
  const message = mine?.state === "saved" || mine?.state === "already" ? null : mine?.reason ?? outcome.lastReason ?? null;
  return { kind: "done", result, message };
}

export function registerSavedPageRowAnswerRoutes(
  app: { get: Function; post: Function; delete?: Function },
  supabase: SupabaseClient,
) {
  app.post(`${SAVED_PAGE_PREFIX}/saved-pages/:id/rows/:lineNo/answer`, async (c: Context) => {
    if (!isOwner(c)) return c.json({ error: OWNER_ONLY }, 403);
    const denied = guardWrite(c);
    if (denied) return denied;
    const id = c.req.param("id") ?? "";
    const lineNo = Number(c.req.param("lineNo"));
    if (!UUID.test(id) || !Number.isInteger(lineNo) || lineNo < 1) return c.json({ error: "Bad row" }, 400);
    let body: AnswerBody = {};
    try {
      body = await c.req.json() as AnswerBody;
    } catch {
      body = {};
    }
    try {
      const out = await answerQuestion(supabase, { pageId: id, lineNo, body, actor: actorOf(c) });
      if (out.kind === "error") return c.json({ error: out.error }, out.status as 400);
      return c.json({ result: out.result, message: out.message });
    } catch (err) {
      console.error("answer failed", err);
      return c.json({ error: SAVE_FAILED }, 500);
    }
  });

  app.get(`${SAVED_PAGE_PREFIX}/lessons`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const { data, error } = await supabase.from("part_maker_word")
      .select("id, phrase, make, model, axle, side, parts_saved, answered_by, updated_at, maintenance_component_id, maintenance_service_categories ( name )")
      .eq("set_by", "owner").order("updated_at", { ascending: false }).limit(500);
    if (error) return c.json({ error: "Couldn't load what Roam learned." }, 500);
    const lessons = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      heading: String(r.phrase ?? ""),
      make: String(r.make ?? ""),
      model: r.model == null ? null : String(r.model),
      axle: r.axle ?? null,
      side: r.side ?? null,
      typeId: String(r.maintenance_component_id ?? ""),
      typeName: String((r.maintenance_service_categories as { name?: string } | null)?.name ?? ""),
      partsSaved: Number(r.parts_saved ?? 0) || 0,
      answeredBy: r.answered_by == null ? null : String(r.answered_by),
      answeredAt: r.updated_at == null ? null : String(r.updated_at),
    }));
    return c.json({ lessons, canUndo: isOwner(c) });
  });

  app.delete?.(`${SAVED_PAGE_PREFIX}/lessons/:id`, async (c: Context) => {
    if (!isOwner(c)) return c.json({ error: "Only the owner can change this" }, 403);
    const denied = guardWrite(c);
    if (denied) return denied;
    const id = c.req.param("id") ?? "";
    if (!UUID.test(id)) return c.json({ error: "Bad id" }, 400);
    const { data, error } = await supabase.rpc("part_maker_word_forget", { p_id: id, p_actor: actorOf(c) });
    if (error) return c.json({ error: "That didn't work. Try again." }, 500);
    if (data !== true) return c.json({ error: "That lesson is already gone" }, 404);
    return c.json({ ok: true });
  });
}
