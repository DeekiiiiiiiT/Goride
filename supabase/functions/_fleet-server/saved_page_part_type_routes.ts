/**
 * R5, R6 and R11 (docs/part-type-learning-audit.md §3): one button adds a part type from a saved page.
 *
 * POST /admin/catalog-research/saved-pages/:id/part-type  { key, action: "add" | "dismiss", name?, groupId? }
 * GET  /admin/catalog-research/hidden-part-type-phrases           the owner's "not a part we track" list
 * DELETE /admin/catalog-research/hidden-part-type-phrases/:id     "Suggest again"
 *
 * Owner only. The create / prove / save / pictures work lives in saved_page_part_type_core.ts (shared with the
 * upload's auto-sort); this route keeps the button's own checks, its suggestion patches and its whole-page answer.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { guardRead, guardWrite } from "./catalog_research_routes.ts";
import { hasPlatformOwnerAccess, type RbacUser } from "./rbac_middleware.ts";
import type { Suggestion } from "./saved_page_suggest.ts";
import { normalisePhrase } from "./saved_page_phrases.ts";
import type { PartPictureQueueDeps, PicturesResult } from "./part_pictures_queue.ts";
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
} from "./research_saved_page_routes.ts";
import { readPartGroups } from "./parts_catalog_read.ts";
import { saveRowsAsPartType } from "./saved_page_part_type_core.ts";

const OWNER_ONLY = "Only the owner can add a part type";

type RbacCtx = { id?: string; userId?: string; resolvedRole?: string; rawRole?: string };

export type SavedPagePartTypeDeps = {
  /** R7: the picture queue. Undefined = the live one; null = skip pictures (tests, or pictures off). */
  pictures?: PartPictureQueueDeps | null;
  /** The picture blockers the page answer is decorated with (tests pass a fixed set). */
  pictureBlockers?: () => Promise<PictureBlockers>;
};

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
      set_by: "owner",
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

  const rows = (result.rows ?? []).filter((row) => row.suggestion === suggestion.key);
  const phrase = String(suggestion.pagePhrase ?? "");

  let outcome;
  try {
    outcome = await saveRowsAsPartType(supabase, {
      page: {
        id: page.id,
        vehicle_catalog_id: page.vehicle_catalog_id,
        domain: page.domain ?? null,
        source_url: page.source_url ?? null,
      },
      name,
      groupId: group.id,
      positionScheme: suggestion.positionScheme,
      phrase,
      rows,
      typeId: suggestion.typeId,
      strict: false,
      answer: { setBy: "owner", actor, reason: null },
      pictures: deps.pictures,
    });
  } catch (err) {
    // Nothing was saved: the card shows the plain reason and Try again. The suggestion stays open.
    try {
      await writeSuggestionPatch(supabase, page.id, key, {
        suggestion: () => ({ reason: plainError(err) }),
        rows: new Map(),
      });
    } catch { /* the answer below still shows the page as stored */ }
    return await answer();
  }

  if (!outcome.ok) {
    try {
      await writeSuggestionPatch(supabase, page.id, suggestion.key, {
        suggestion: () => ({
          ...(outcome.type ? { typeId: outcome.type.id, typeName: outcome.type.name } : {}),
          reason: outcome.error,
        }),
        rows: new Map(),
      });
    } catch { /* the answer below still shows the page as stored */ }
    return await answer();
  }

  const type = outcome.type;
  const rowPatches = new Map<number, RowPatch>(
    outcome.decisions.map((d) => [
      d.row.lineNo,
      {
        partType: type.name,
        group: d.state,
        reason: d.state === "held" ? d.reason : null,
        jobId: d.jobId,
      },
    ]),
  );

  try {
    await writeSuggestionPatch(supabase, page.id, suggestion.key, {
      suggestion: () =>
        outcome.everyRowFinal
          ? { status: "added", typeId: type.id, typeName: type.name, reason: null }
          : {
            status: "open",
            typeId: type.id,
            typeName: type.name,
            reason: outcome.lastReason ?? "Roam couldn't save these parts. Try again.",
          },
      rows: rowPatches,
      ...(outcome.pictures ? { pictures: outcome.pictures } : {}),
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
      .select("id, phrase, group_id, dismissed_by, dismissed_at, set_by, note")
      .order("dismissed_at", { ascending: false })
      .limit(200);
    if (error) return c.json({ error: error.message }, 500);
    const rows = (data ?? []) as Array<{
      id: string;
      phrase: string;
      group_id: string | null;
      dismissed_by: string | null;
      dismissed_at: string;
      set_by: string | null;
      note: string | null;
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
        setBy: row.set_by ?? "owner",
        reason: row.note,
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
