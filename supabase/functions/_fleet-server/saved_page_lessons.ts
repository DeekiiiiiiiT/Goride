/**
 * Answers teach Roam (docs/answers-teach-roam-audit.md AT-01 / AT-02 / AT-04 / AT-06 / AT-07).
 *
 * One list of what a car maker calls a part: `public.part_maker_word` (migration 20261127172750 + 20261127173506).
 * Seed rows are the old hand-written partFinder rows; owner rows are lessons from the owner's answers. The upload's row
 * check, the browser check's wording and the answer route all read it through this file, so there is one rule.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { normalisePhrase, pagePhraseFromGroupLine, withoutSideWords } from "./saved_page_phrases.ts";

export type MakerWord = {
  id: string;
  phraseKey: string;
  phrase: string;
  make: string;
  model: string | null;
  typeId: string;
  typeName: string;
  axle: "front" | "rear" | null;
  side: "left" | "right" | "both" | null;
  searchWord: string | null;
  setBy: "seed" | "owner";
  partsSaved: number;
  answeredBy: string | null;
  updatedAt: string | null;
};

/** Every word for one make. An empty list means "no words for this make" (Honda today), never an error. */
export type MakerWords = { make: string | null; words: MakerWord[] };

export const NO_MAKER_WORDS: MakerWords = { make: null, words: [] };

const lower = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

export function parseMakerWords(make: string | null, data: unknown): MakerWords {
  const words: MakerWord[] = [];
  for (const r of (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>) {
    const axle = r.axle === "front" || r.axle === "rear" ? r.axle : null;
    const side = r.side === "left" || r.side === "right" || r.side === "both" ? r.side : null;
    if (!r.id || !r.phrase_key || !r.maintenance_component_id) continue;
    words.push({
      id: String(r.id),
      phraseKey: String(r.phrase_key),
      phrase: String(r.phrase ?? ""),
      make: String(r.make ?? make ?? ""),
      model: r.model == null ? null : String(r.model),
      typeId: String(r.maintenance_component_id),
      typeName: String(r.part_type_name ?? ""),
      axle,
      side,
      searchWord: r.search_word == null ? null : String(r.search_word),
      setBy: r.set_by === "owner" ? "owner" : "seed",
      partsSaved: Number(r.parts_saved ?? 0) || 0,
      answeredBy: r.answered_by == null ? null : String(r.answered_by),
      updatedAt: r.updated_at == null ? null : String(r.updated_at),
    });
  }
  return { make, words };
}

/** Load one make's words. Throws when the read fails: the upload must not quietly lose the maker's words. */
export async function loadMakerWords(supabase: SupabaseClient, make: string | null | undefined): Promise<MakerWords> {
  const m = String(make ?? "").trim();
  if (!m) return NO_MAKER_WORDS;
  const { data, error } = await supabase.rpc("part_maker_words_for", { p_make: m });
  if (error) throw new Error(`maker words not read: ${error.message}`);
  return parseMakerWords(m, data);
}

/** The heading key a page row is remembered by: the group row, callout and side words removed (normalisePhrase). */
export function headingKey(groupLine: string | null | undefined): string {
  return groupLine ? normalisePhrase(pagePhraseFromGroupLine(groupLine)) : "";
}

/** The heading as a lesson shows it: callout and side words removed ("48619 - BEARING, STRUT MOUNTING, RH" → "BEARING, STRUT MOUNTING"). */
export function lessonPhrase(groupLine: string | null | undefined): string {
  return groupLine ? withoutSideWords(pagePhraseFromGroupLine(groupLine)) : "";
}

/** The page's own words for a part type on this make (seed and owner), for the row check (P4) and the drawer. */
export function wordsForType(mw: MakerWords | null | undefined, typeId: string): string[] {
  if (!mw) return [];
  const out: string[] = [];
  for (const w of mw.words) {
    if (w.typeId !== typeId) continue;
    out.push(w.phrase);
    if (w.searchWord) out.push(w.searchWord);
  }
  return out;
}

export type RowLesson = {
  /** The owner's wording lesson for this heading (make only), or the model's place lesson, which also names the type. */
  type: MakerWord | null;
  /** The owner's place lesson for this heading on this model. */
  place: MakerWord | null;
};

/**
 * AT-02 / AT-07: the owner's lessons for one page row. Only owner rows: seed rows work through their words (P4), never
 * by key, so they behave exactly as partFinder did. A place lesson is only used on the model it was answered for.
 */
export function lessonFor(
  mw: MakerWords | null | undefined,
  groupLine: string | null | undefined,
  model: string | null | undefined,
): RowLesson {
  const key = headingKey(groupLine);
  if (!mw || !key) return { type: null, place: null };
  const owner = mw.words.filter((w) => w.setBy === "owner" && w.phraseKey === key);
  const place = owner.find((w) => w.model != null && lower(w.model) === lower(model) && (w.axle || w.side)) ?? null;
  const wording = owner.find((w) => w.model == null) ?? null;
  return { type: wording ?? place, place };
}

/**
 * AT-06: what to search for and which row to look for on a maker's site, for the browser check's steps. The owner's
 * newest lesson wins, then the seed row; with neither, the type's own name (today's behaviour).
 */
export function makerWordsFor(
  mw: MakerWords | null | undefined,
  typeId: string,
  typeName: string,
): { search: string; rowName: string | null } {
  const plain = { search: typeName.toLowerCase(), rowName: null };
  if (!mw) return plain;
  const forType = mw.words.filter((w) => w.typeId === typeId && w.model == null);
  const owner = forType.filter((w) => w.setBy === "owner").sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0];
  const seed = forType.find((w) => w.setBy === "seed");
  const pick = owner ?? seed;
  if (!pick) return plain;
  const search = pick.searchWord ?? headWord(pick.phrase) ?? plain.search;
  return { search, rowName: pick.phrase };
}

/** "SUPPORT SUB-ASSY, FRONT SUSPENSION" → "support": the first word, lower case. */
function headWord(phrase: string): string | null {
  const first = String(phrase ?? "").split(/[^A-Za-z0-9]+/).find((w) => w.length >= 3);
  return first ? first.toLowerCase() : null;
}

/**
 * AT-04: remember one owner answer. A wording answer is stored for the make; a place or side answer for the make and
 * model. Returns the lesson ids it wrote (one or two).
 */
export async function rememberAnswer(
  supabase: SupabaseClient,
  input: {
    groupLine: string | null;
    make: string | null;
    model: string | null;
    typeId: string;
    wording: boolean;
    axle?: "front" | "rear" | null;
    side?: "left" | "right" | "both" | null;
    actor: string | null;
  },
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const key = headingKey(input.groupLine);
  // The heading as the list shows it: the side word is the row's place, not the part's name ("…, RH" covers LH too).
  const phrase = lessonPhrase(input.groupLine);
  const make = String(input.make ?? "").trim();
  if (!key || !phrase) return { ok: false, error: "The page has no heading for this part" };
  if (!make) return { ok: false, error: "The car has no maker" };
  const ids: string[] = [];
  const write = async (model: string | null, axle: string | null, side: string | null) => {
    const { data, error } = await supabase.rpc("part_maker_word_set", {
      p_phrase_key: key,
      p_phrase: phrase,
      p_make: make,
      p_model: model,
      p_component_id: input.typeId,
      p_axle: axle,
      p_side: side,
      p_actor: input.actor,
    });
    if (error) throw new Error(error.message);
    const id = (data as { id?: string } | null)?.id;
    if (id) ids.push(String(id));
  };
  try {
    if (input.wording) await write(null, null, null);
    if ((input.axle || input.side) && String(input.model ?? "").trim()) {
      await write(String(input.model).trim(), input.axle ?? null, input.side ?? null);
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, ids };
}

/** AT-08: add n saved parts to each lesson that saved them. Best effort: a count is never worth failing a save. */
export async function countLessonSaves(supabase: SupabaseClient, counts: ReadonlyMap<string, number>): Promise<void> {
  for (const [id, n] of counts) {
    if (n <= 0) continue;
    try {
      await supabase.rpc("part_maker_word_saved", { p_id: id, p_count: n });
    } catch (err) {
      console.warn("lesson count not saved", err);
    }
  }
}
