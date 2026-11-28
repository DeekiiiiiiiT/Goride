/**
 * R3, R5, R6 (docs/part-type-auto-sort-audit.md §4): apply the sorter to one saved page.
 *
 * `runSavedPage` writes the page result first, then calls sortSavedPage, so a failed sort never loses the upload.
 * The catalog-research worker calls sortWaitingNames in its idle path (one AI batch an hour at most); the second
 * page of the same upload then resolves from the saved answers with no AI call (R6).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { readPartGroups } from "./parts_catalog_read.ts";
import { DEFAULT_GROUP } from "./saved_page_suggest.ts";
import { normalisePhrase, pagePhraseFromGroupLine } from "./saved_page_phrases.ts";
import {
  buildSortNames,
  sortUnknownNames,
  type SavedAnswer,
  type SavedAnswers,
  type SortDecision,
} from "./saved_page_auto_sort.ts";
import {
  MAX_SORT_NAMES,
  readSortWithGemini,
  type SavedPageSortAi,
} from "./saved_page_sort_ai.ts";
import {
  type CoreDecision,
  readActiveTypes,
  saveRowsAsPartType,
} from "./saved_page_part_type_core.ts";
import type { PartPictureQueueDeps, PicturesResult } from "./part_pictures_queue.ts";
import type { ResultRow, SavedPageResult, SavedPageRow } from "./research_saved_page_routes.ts";
import { countRowsByGroup } from "./saved_page_result.ts";

const HOUR_MS = 60 * 60 * 1000;
/** G6: leave this much of the daily cap unspent before starting another sort call. */
export const SORT_CAP_RESERVE_USD = 0.10;

export type PageUpdate = {
  suggestion?: { status?: "added" | "skipped" | "waiting"; typeId?: string | null; typeName?: string | null; reason?: string | null };
  rows?: Map<number, { partType?: string; group?: ResultRow["group"]; reason?: string | null; jobId?: string | null }>;
};

export type SortRunOptions = {
  /** Undefined = no AI call (tests, or a second page that only needs the saved answers). */
  sortAi?: SavedPageSortAi;
  pictures?: PartPictureQueueDeps | null;
  allowAi: boolean;
  cap?: number;
  spendNow?: () => Promise<number>;
};

export type SortRunResult = {
  pageId: string;
  decided: number;
  open: number;
  aiCalled: boolean;
  saved: number;
};

function resultOf(row: SavedPageRow): SavedPageResult {
  const result = (row.result ?? {}) as SavedPageResult;
  return { ...result, rows: result.rows ?? [], suggestions: result.suggestions ?? [] };
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

/** Every saved answer for the given names (or all), by phrase key. Owner wins if a phrase has both rows. */
export async function readSavedAnswers(
  supabase: SupabaseClient,
  keys?: ReadonlyArray<string>,
): Promise<SavedAnswers> {
  const answers = new Map<string, SavedAnswer>();
  const wanted = keys ? [...new Set(keys.filter(Boolean))] : null;
  if (wanted && !wanted.length) return answers;
  let synonymQuery = supabase.from("part_term_synonym")
    .select("phrase_key, canonical, maintenance_component_id, added_by, reason")
    .not("phrase_key", "is", null);
  let dismissalQuery = supabase.from("part_type_suggestion_dismissal")
    .select("phrase_key, set_by, note");
  if (wanted) {
    synonymQuery = synonymQuery.in("phrase_key", wanted);
    dismissalQuery = dismissalQuery.in("phrase_key", wanted);
  }
  const [{ data: synonyms, error: synonymError }, { data: dismissals, error: dismissalError }] = await Promise.all([
    synonymQuery.limit(2000),
    dismissalQuery.limit(2000),
  ]);
  if (synonymError) throw synonymError;
  if (dismissalError) throw dismissalError;
  for (const row of (synonyms ?? []) as Array<Record<string, unknown>>) {
    const key = String(row.phrase_key ?? "");
    if (!key) continue;
    answers.set(key, {
      verdict: "track",
      setBy: row.added_by === "owner" ? "owner" : "roam",
      typeId: row.maintenance_component_id ? String(row.maintenance_component_id) : null,
      typeName: row.canonical ? String(row.canonical) : null,
      reason: row.reason ? String(row.reason) : null,
    });
  }
  for (const row of (dismissals ?? []) as Array<Record<string, unknown>>) {
    const key = String(row.phrase_key ?? "");
    if (!key) continue;
    if (answers.get(key)?.setBy === "owner") continue;
    answers.set(key, {
      verdict: "skip",
      setBy: row.set_by === "owner" ? "owner" : "roam",
      typeId: null,
      typeName: null,
      reason: row.note ? String(row.note) : null,
    });
  }
  return answers;
}

async function writeSkip(
  supabase: SupabaseClient,
  key: string,
  phrase: string,
  setBy: "owner" | "roam",
  reason: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("part_name_answer_set", {
    p_phrase_key: key,
    p_phrase: phrase,
    p_verdict: "skip",
    p_type_id: null,
    p_set_by: setBy,
    p_reason: reason,
    p_actor: null,
  });
  if (error) throw new Error(error.message);
}

export function rowUpdates(decisions: ReadonlyArray<CoreDecision>, typeName: string) {
  const out = new Map<number, { partType: string; group: ResultRow["group"]; reason: string | null; jobId: string | null; place?: string | null; waitReason?: string | null }>();
  for (const d of decisions) {
    out.set(d.row.lineNo, {
      partType: typeName,
      group: d.state,
      // Rev 2 §4: only held (a page gap / Roam problem) and not_saved (a fact) carry a plain line.
      reason: d.state === "held" || d.state === "not_saved" ? d.reason : null,
      jobId: d.jobId,
      ...(d.state === "left_for_later" ? { waitReason: d.waitReason ?? null } : {}),
      // The core may fill in an axle from the page heading (REAR) when the row itself never writes it (Rev 2 §3.6).
      ...(d.row.place !== undefined ? { place: d.row.place } : {}),
    });
  }
  return out;
}

/** Write one page's result: only suggestions still open/waiting, and rows matched by key (old rows by group line). */
export async function patchSavedPageResult(
  supabase: SupabaseClient,
  pageId: string,
  updates: ReadonlyMap<string, PageUpdate>,
  pictures?: PicturesResult,
  sortAt?: string,
): Promise<void> {
  if (!updates.size && !pictures && !sortAt) return;
  const { data, error } = await supabase.from("research_saved_page").select("id, result").eq("id", pageId).maybeSingle();
  if (error) throw error;
  if (!data) return;
  const current = resultOf(data as SavedPageRow);
  for (const suggestion of current.suggestions ?? []) {
    const update = updates.get(suggestion.key);
    if (!update?.suggestion) continue;
    if (suggestion.status !== "open" && suggestion.status !== "waiting") continue;
    Object.assign(suggestion, update.suggestion);
  }
  for (const row of current.rows ?? []) {
    const key = row.phraseKey ?? normalisePhrase(pagePhraseFromGroupLine(row.groupLine));
    if (!key) continue;
    const change = updates.get(key)?.rows?.get(row.lineNo);
    if (change) Object.assign(row, change);
  }
  const counts = countRowsByGroup(current.rows ?? []);
  const next: SavedPageResult = {
    ...current,
    rows: current.rows ?? [],
    counts,
    skipped: counts.left_for_later,
    suggestions: current.suggestions ?? [],
  };
  if (pictures) next.pictures = mergePictures(current.pictures, pictures);
  if (sortAt) next.sortAt = sortAt;
  const { error: writeError } = await supabase.from("research_saved_page").update({ result: next }).eq("id", pageId);
  if (writeError) throw writeError;
}

/**
 * Sort one upload. Called after its result is stored (R3), and by the worker for old/waiting uploads (R5/R6).
 * A decision is written through part_name_answer_set by the core; a `track` also saves the rows and queues pictures.
 */
export async function sortSavedPage(
  supabase: SupabaseClient,
  pageId: string,
  opts: SortRunOptions,
): Promise<SortRunResult | null> {
  const { data, error } = await supabase.from("research_saved_page")
    .select("id, vehicle_catalog_id, domain, source_url, result")
    .eq("id", pageId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const pageRow = data as SavedPageRow;
  const result = resultOf(pageRow);
  const groups = await readPartGroups(supabase);
  const names = buildSortNames(result.rows ?? [], groups);
  if (!names.length) return { pageId, decided: 0, open: 0, aiCalled: false, saved: 0 };

  const types = await readActiveTypes(supabase);
  const saved = await readSavedAnswers(supabase, names.map((n) => n.key));
  const outcome = sortUnknownNames({ names, types, saved });
  const updates = new Map<string, PageUpdate>();
  let pictures: PicturesResult | undefined;
  let savedRows = 0;

  for (const decision of outcome.decided) {
    if (decision.verdict === "skip") {
      if (decision.writeAnswer) await writeSkip(supabase, decision.key, decision.phrase, decision.setBy, decision.reason);
      updates.set(decision.key, { suggestion: { status: "skipped", reason: decision.reason } });
      continue;
    }
    const run = await saveRowsAsPartType(supabase, {
      page: {
        id: pageRow.id,
        vehicle_catalog_id: pageRow.vehicle_catalog_id,
        domain: pageRow.domain ?? null,
        source_url: pageRow.source_url ?? null,
      },
      name: decision.name,
      groupId: decision.groupId ?? "",
      positionScheme: decision.positionScheme,
      phrase: decision.phrase,
      rows: decision.rows,
      typeId: decision.typeId,
      strict: true,
      answer: { setBy: decision.setBy, actor: null, reason: decision.reason, write: decision.writeAnswer },
      pictures: opts.pictures ?? null,
    });
    if (!run.ok) {
      updates.set(decision.key, { suggestion: { status: "waiting", reason: run.error } });
      continue;
    }
    savedRows += run.decisions.filter((d) => d.state === "saved").length;
    if (run.pictures) pictures = mergePictures(pictures, run.pictures);
    updates.set(decision.key, {
      suggestion: {
        status: run.everyRowFinal ? "added" : "waiting",
        typeId: run.type.id,
        typeName: run.type.name,
        reason: run.everyRowFinal ? null : (run.lastReason ?? "Roam couldn't save these parts."),
      },
      rows: rowUpdates(run.decisions, run.type.name),
    });
  }

  let aiCalled = false;
  if (outcome.open.length) {
    let canSpend = opts.allowAi && Boolean(opts.sortAi);
    if (canSpend && opts.cap != null && opts.cap > 0 && opts.spendNow) {
      const spend = await opts.spendNow();
      canSpend = spend < opts.cap - SORT_CAP_RESERVE_USD;
    }
    if (canSpend && opts.sortAi) {
      aiCalled = true;
      try {
        const items = outcome.open.slice(0, MAX_SORT_NAMES).map((o) => ({
          key: o.key,
          name: o.name,
          group: o.groupName,
          line: o.line,
        }));
        const answers = await opts.sortAi({ items, groups: groups.map((g) => g.name) });
        const byKey = new Map(answers.map((a) => [a.key, a]));
        for (const open of outcome.open) {
          const answer = byKey.get(open.key);
          const phrase = pagePhraseFromGroupLine(open.rows[0]?.groupLine ?? "");
          if (!answer) {
            updates.set(open.key, { suggestion: { status: "waiting", reason: "Roam will sort this shortly" } });
            continue;
          }
          if (answer.verdict === "track") {
            const aiGroup = groups.find((g) => g.name === answer.group) ?? null;
            const groupName = open.groupName === DEFAULT_GROUP && aiGroup ? aiGroup.name : open.groupName;
            const groupId = groups.find((g) => g.name === groupName)?.id ?? open.groupId ?? "";
            const run = await saveRowsAsPartType(supabase, {
              page: {
                id: pageRow.id,
                vehicle_catalog_id: pageRow.vehicle_catalog_id,
                domain: pageRow.domain ?? null,
                source_url: pageRow.source_url ?? null,
              },
              name: open.name,
              groupId,
              positionScheme: answer.positionScheme,
              phrase,
              rows: open.rows,
              typeId: null,
              strict: true,
              answer: { setBy: "roam", actor: null, reason: answer.reason, write: true },
              pictures: opts.pictures ?? null,
            });
            if (!run.ok) {
              updates.set(open.key, { suggestion: { status: "waiting", reason: run.error } });
              continue;
            }
            savedRows += run.decisions.filter((d) => d.state === "saved").length;
            if (run.pictures) pictures = mergePictures(pictures, run.pictures);
            updates.set(open.key, {
              suggestion: {
                status: run.everyRowFinal ? "added" : "waiting",
                typeId: run.type.id,
                typeName: run.type.name,
                reason: run.everyRowFinal ? null : (run.lastReason ?? "Roam couldn't save these parts."),
              },
              rows: rowUpdates(run.decisions, run.type.name),
            });
          } else {
            await writeSkip(supabase, open.key, phrase, "roam", answer.reason || "Not a part we track");
            updates.set(open.key, { suggestion: { status: "skipped", reason: answer.reason || "Not a part we track" } });
          }
        }
      } catch (err) {
        console.error("name sort ai failed", err);
        for (const open of outcome.open) {
          if (!updates.has(open.key)) {
            updates.set(open.key, { suggestion: { status: "waiting", reason: "Roam will sort this shortly" } });
          }
        }
      }
    } else {
      for (const open of outcome.open) {
        updates.set(open.key, { suggestion: { status: "waiting", reason: "Roam will sort this shortly" } });
      }
    }
  }

  await patchSavedPageResult(supabase, pageId, updates, pictures, aiCalled ? new Date().toISOString() : undefined);
  return { pageId, decided: outcome.decided.length, open: outcome.open.length, aiCalled, saved: savedRows };
}

/** Pages with at least one open or waiting suggestion, oldest first. */
async function waitingPages(supabase: SupabaseClient, limit: number): Promise<Array<{ id: string }>> {
  // Filtered in the database: taking the oldest N uploads first and filtering after would never reach a newer upload
  // once the oldest N are all sorted.
  const found = new Map<string, string>();
  for (const status of ["waiting", "open"]) {
    const { data, error } = await supabase.from("research_saved_page")
      .select("id, created_at").eq("status", "done")
      .filter("result->suggestions", "cs", JSON.stringify([{ status }]))
      .order("created_at", { ascending: true }).limit(limit);
    if (error) throw error;
    for (const p of (data ?? []) as Array<{ id: string; created_at: string }>) found.set(p.id, p.created_at);
  }
  return [...found.entries()].sort((a, b) => a[1].localeCompare(b[1])).slice(0, limit).map(([id]) => ({ id }));
}

export type WaitingSortDeps = {
  sortAi?: SavedPageSortAi;
  pictures?: PartPictureQueueDeps | null;
  now?: () => Date;
};

/**
 * R5/R6: the worker's idle-path sort. At most one AI batch an hour, below cap − reserve. The first page may call
 * the AI; up to 10 more pages then resolve from the answers it just wrote, with no further AI call.
 */
export async function sortWaitingNames(
  supabase: SupabaseClient,
  deps: WaitingSortDeps = {},
): Promise<{ sorted: string | null; pages: number; skipped?: string }> {
  const now = deps.now?.() ?? new Date();
  // The sort writes result.sortAt whenever it tries an AI call. A failed gate read stops the sort rather than
  // risking a call a minute.
  const { data: last, error: gateError } = await supabase.from("research_saved_page")
    .select("result")
    .not("result->>sortAt", "is", null)
    .order("result->>sortAt", { ascending: false })
    .limit(1).maybeSingle();
  if (gateError) return { sorted: null, pages: 0, skipped: "gate" };
  const lastSortAt = (last as { result?: { sortAt?: string } } | null)?.result?.sortAt;
  const lastAt = lastSortAt ? Date.parse(String(lastSortAt)) : NaN;
  if (Number.isFinite(lastAt) && now.getTime() - lastAt < HOUR_MS) return { sorted: null, pages: 0, skipped: "recent" };

  const { data: settings } = await supabase.from("catalog_research_settings")
    .select("daily_spend_usd").eq("id", 1).single();
  const cap = Number((settings as { daily_spend_usd?: number } | null)?.daily_spend_usd ?? 0);
  const spendNow = async (): Promise<number> => {
    const { data } = await supabase.rpc("catalog_research_spend_today");
    return Number(data) || 0;
  };
  if (cap > 0 && (await spendNow()) >= cap - SORT_CAP_RESERVE_USD) return { sorted: null, pages: 0, skipped: "spend" };

  const pages = await waitingPages(supabase, 40);
  if (!pages.length) return { sorted: null, pages: 0, skipped: "none" };

  const first = pages[0];
  await sortSavedPage(supabase, first.id, {
    sortAi: deps.sortAi ?? readSortWithGemini,
    pictures: deps.pictures ?? null,
    allowAi: true,
    cap,
    spendNow,
  });

  let handled = 1;
  for (const page of pages.slice(1, 11)) {
    await sortSavedPage(supabase, page.id, {
      sortAi: deps.sortAi,
      pictures: deps.pictures ?? null,
      allowAi: false,
      cap,
      spendNow,
    });
    handled += 1;
  }
  return { sorted: first.id, pages: handled };
}
