/**
 * R4 (docs/part-type-auto-sort-audit.md §4 R4): the "Sorted by Roam" review list and its two buttons.
 *
 * GET  /admin/catalog-research/part-names?tab=added|not_tracked&by=owner|roam&cursor=…
 * POST /admin/catalog-research/part-names/:key/track
 * POST /admin/catalog-research/part-names/:key/skip
 *
 * Staff read the list; only the owner changes an answer. Track re-saves the kept rows on at most 10 pages a press and
 * answers `remaining`; skip passes the owner's login as p_actor and drafts a Roam-made type when it has no other word.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { guardRead, guardWrite } from "./catalog_research_routes.ts";
import { hasPlatformOwnerAccess, type RbacUser } from "./rbac_middleware.ts";
import { readPartGroups } from "./parts_catalog_read.ts";
import { normalisePhrase, pagePhraseFromGroupLine, plainNameFromPhrase } from "./saved_page_phrases.ts";
import { positionSchemeOf, suggestedGroupName } from "./saved_page_suggest.ts";
import { saveRowsAsPartType } from "./saved_page_part_type_core.ts";
import { patchSavedPageResult, rowUpdates } from "./saved_page_auto_sort_run.ts";
import { type PartPictureQueueDeps } from "./part_pictures_queue.ts";
import { SAVED_PAGE_PREFIX, type ResultRow, type SavedPageResult, type SavedPageRow } from "./research_saved_page_routes.ts";

const KEY = /^[A-Z0-9]+$/;
const PAGE_LIMIT = 10;

type RbacCtx = { id?: string; userId?: string };

export type PartNamesDeps = {
  pictures?: PartPictureQueueDeps | null;
};

function isOwner(c: Context): boolean {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return !!user && hasPlatformOwnerAccess(user);
}

function actorOf(c: Context): string | null {
  const user = c.get("rbacUser") as RbacCtx | undefined;
  return user?.id ?? user?.userId ?? null;
}

function resultOf(row: SavedPageRow): SavedPageResult {
  const result = (row.result ?? {}) as SavedPageResult;
  return { ...result, rows: result.rows ?? [], suggestions: result.suggestions ?? [] };
}

function rowKey(row: ResultRow): string {
  return row.phraseKey ?? normalisePhrase(pagePhraseFromGroupLine(row.groupLine));
}

function rowsForKey(result: SavedPageResult, key: string): ResultRow[] {
  return (result.rows ?? []).filter((row) =>
    row.group === "not_roam_type" || row.group === "held"
  ).filter((row) => rowKey(row) === key || row.suggestion === key);
}

function phraseForKey(result: SavedPageResult, key: string): string {
  const row = (result.rows ?? []).find((r) => rowKey(r) === key || r.suggestion === key);
  return pagePhraseFromGroupLine(row?.groupLine ?? "");
}

function placeOf(row: ResultRow): { axle: string | null; side: string | null } {
  const words = String(row.place ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const axle = words.includes("front") ? "front" : words.includes("rear") ? "rear" : null;
  const side = words.includes("left") ? "left" : words.includes("right") ? "right" : words.includes("both") ? "both" : null;
  return { axle, side };
}

function cleanName(name: string): string {
  return String(name ?? "").replace(/\b(sub-?assy|assy)\b/gi, " ").replace(/\s+/g, " ").trim()
    .replace(/^./, (c) => c.toUpperCase());
}

async function pagesForKey(
  supabase: SupabaseClient,
  key: string,
  limit: number,
): Promise<SavedPageRow[]> {
  const { data, error } = await supabase.from("research_saved_page")
    .select("id, vehicle_catalog_id, domain, source_url, result")
    .eq("status", "done")
    .contains("result", { suggestions: [{ key }] })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SavedPageRow[];
}

async function countPagesForKey(supabase: SupabaseClient, key: string): Promise<number> {
  const { count } = await supabase.from("research_saved_page")
    .select("id", { count: "exact", head: true })
    .eq("status", "done")
    .contains("result", { suggestions: [{ key }] });
  return count ?? 0;
}

async function uploadsForKey(supabase: SupabaseClient, key: string): Promise<number> {
  try {
    return await countPagesForKey(supabase, key);
  } catch {
    return 0;
  }
}

function cursorOf(at: string, key: string): string {
  return `${at}|${key}`;
}

function parseCursor(cursor: string | undefined): { at: string; key: string } | null {
  if (!cursor) return null;
  const [at, key] = cursor.split("|");
  if (!at || !key || !KEY.test(key)) return null;
  return { at, key };
}

export function registerSavedPagePartNamesRoutes(
  app: { get: Function; post: Function },
  supabase: SupabaseClient,
  deps: PartNamesDeps = {},
) {
  // R4: the review list. Staff may read; the buttons are owner only.
  app.get(`${SAVED_PAGE_PREFIX}/part-names`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const tab = c.req.query("tab") === "not_tracked" ? "not_tracked" : "added";
    const byRaw = c.req.query("by") ?? "";
    const by = byRaw === "owner" || byRaw === "roam" ? byRaw : null;
    const cursor = parseCursor(c.req.query("cursor") ?? undefined);
    const limit = 50;

    if (tab === "added") {
      let query = supabase.from("part_term_synonym")
        .select("term, canonical, maintenance_component_id, phrase_key, added_by, added_at, reason")
        .not("phrase_key", "is", null);
      if (by === "owner") query = query.eq("added_by", "owner");
      // A seed row that Roam adopted is a Roam answer, not a seed-only search word.
      else if (by === "roam") query = query.in("added_by", ["roam", "seed"]);
      if (cursor) {
        query = query.or(`added_at.lt."${cursor.at}",and(added_at.eq."${cursor.at}",phrase_key.lt."${cursor.key}")`);
      }
      const { data, error } = await query
        .order("added_at", { ascending: false })
        .order("phrase_key", { ascending: false })
        .limit(limit + 1);
      if (error) return c.json({ error: error.message }, 500);
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const items = rows.slice(0, limit);
      const typeIds = [...new Set(items.map((r) => String(r.maintenance_component_id ?? "")).filter(Boolean))];
      const typeRows = typeIds.length
        ? (await supabase.from("maintenance_service_categories").select("id, name, parent_id").in("id", typeIds)).data ?? []
        : [];
      const parentIds = [...new Set((typeRows as Array<Record<string, unknown>>).map((t) => String(t.parent_id ?? "")).filter(Boolean))];
      const parents = parentIds.length
        ? (await supabase.from("maintenance_service_categories").select("id, name").in("id", parentIds)).data ?? []
        : [];
      const parentName = new Map((parents as Array<Record<string, unknown>>).map((p) => [String(p.id), String(p.name)]));
      const typeById = new Map((typeRows as Array<Record<string, unknown>>).map((t) => [String(t.id), t]));
      const out = [];
      for (const row of items) {
        const key = String(row.phrase_key ?? "");
        const type = typeById.get(String(row.maintenance_component_id ?? ""));
        out.push({
          key,
          phrase: String(row.term ?? key),
          name: String(type?.name ?? row.canonical ?? ""),
          typeId: row.maintenance_component_id ? String(row.maintenance_component_id) : null,
          typeName: type?.name ? String(type.name) : row.canonical ? String(row.canonical) : null,
          groupName: type?.parent_id ? parentName.get(String(type.parent_id)) ?? null : null,
          reason: row.reason ? String(row.reason) : null,
          setBy: row.added_by === "owner" ? "owner" : "roam",
          at: String(row.added_at ?? ""),
          uploads: await uploadsForKey(supabase, key),
        });
      }
      const last = items[items.length - 1];
      return c.json({
        items: out,
        nextCursor: rows.length > limit && last ? cursorOf(String(last.added_at), String(last.phrase_key)) : null,
      });
    }

    let query = supabase.from("part_type_suggestion_dismissal")
      .select("phrase_key, phrase, set_by, dismissed_at, note");
    if (by) query = query.eq("set_by", by);
    if (cursor) {
      query = query.or(`dismissed_at.lt."${cursor.at}",and(dismissed_at.eq."${cursor.at}",phrase_key.lt."${cursor.key}")`);
    }
    const { data, error } = await query
      .order("dismissed_at", { ascending: false })
      .order("phrase_key", { ascending: false })
      .limit(limit + 1);
    if (error) return c.json({ error: error.message }, 500);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const items = rows.slice(0, limit);
    const out = [];
    for (const row of items) {
      const key = String(row.phrase_key ?? "");
      out.push({
        key,
        phrase: String(row.phrase ?? ""),
        name: null,
        typeId: null,
        typeName: null,
        groupName: null,
        reason: row.note ? String(row.note) : null,
        setBy: row.set_by === "owner" ? "owner" : "roam",
        at: String(row.dismissed_at ?? ""),
        uploads: await uploadsForKey(supabase, key),
      });
    }
    const last = items[items.length - 1];
    return c.json({
      items: out,
      nextCursor: rows.length > limit && last ? cursorOf(String(last.dismissed_at), String(last.phrase_key)) : null,
    });
  });

  // R4: Track it. Owner only. 10 pages a press; the rest wait for the next press.
  app.post(`${SAVED_PAGE_PREFIX}/part-names/:key/track`, async (c: Context) => {
    if (!isOwner(c)) return c.json({ error: "Only the owner can change this" }, 403);
    const denied = guardWrite(c);
    if (denied) return denied;
    const key = String(c.req.param("key") ?? "").toUpperCase();
    if (!KEY.test(key)) return c.json({ error: "Bad name" }, 400);
    const actor = actorOf(c);

    const { data: synonym } = await supabase.from("part_term_synonym")
      .select("canonical, maintenance_component_id, added_by")
      .eq("phrase_key", key).maybeSingle();
    const { data: dismissal } = await supabase.from("part_type_suggestion_dismissal")
      .select("phrase").eq("phrase_key", key).maybeSingle();
    const pages = await pagesForKey(supabase, key, PAGE_LIMIT + 1);
    if (!synonym && !dismissal && !pages.length) return c.json({ error: "That name isn't on file" }, 404);

    const phrase = (pages.length ? phraseForKey(resultOf(pages[0]), key) : String((dismissal as { phrase?: string } | null)?.phrase ?? ""))
      || String((synonym as { canonical?: string } | null)?.canonical ?? key);
    const name = cleanName(String((synonym as { canonical?: string } | null)?.canonical ?? "") || plainNameFromPhrase(phrase));
    if (!name) return c.json({ error: "That name has no words to make a part type from" }, 400);

    const groups = await readPartGroups(supabase);
    let typeId = (synonym as { maintenance_component_id?: string } | null)?.maintenance_component_id
      ? String((synonym as { maintenance_component_id?: string }).maintenance_component_id)
      : null;
    let groupId = "";
    if (typeId) {
      const { data: type } = await supabase.from("maintenance_service_categories")
        .select("parent_id").eq("id", typeId).maybeSingle();
      groupId = type?.parent_id ? String((type as { parent_id?: string }).parent_id) : "";
    }
    if (!groupId) {
      const groupName = suggestedGroupName(name);
      groupId = groups.find((g) => g.name === groupName)?.id ?? "";
    }
    if (!groupId) return c.json({ error: "Choose a part group" }, 400);

    const ownerAlready = (synonym as { added_by?: string } | null)?.added_by === "owner";
    let processed = 0;
    let saved = 0;
    let busy = false;
    let lastType: { id: string; name: string } | null = null;

    for (const page of pages.slice(0, PAGE_LIMIT)) {
      const result = resultOf(page);
      const rows = rowsForKey(result, key);
      if (!rows.length) {
        processed += 1;
        continue;
      }
      const scheme = positionSchemeOf(rows.map(placeOf));
      const run = await saveRowsAsPartType(supabase, {
        page: {
          id: page.id,
          vehicle_catalog_id: page.vehicle_catalog_id,
          domain: page.domain ?? null,
          source_url: page.source_url ?? null,
        },
        name,
        groupId,
        positionScheme: scheme,
        phrase,
        rows,
        typeId,
        strict: true,
        answer: {
          setBy: "owner",
          actor,
          reason: "Tracked from the review list",
          write: processed === 0 && !ownerAlready,
        },
        pictures: deps.pictures ?? null,
      });
      if (!run.ok) {
        if (processed === 0) return c.json({ error: run.error }, 400);
        break;
      }
      typeId = run.type.id;
      lastType = { id: run.type.id, name: run.type.name };
      saved += run.decisions.filter((d) => d.state === "saved").length;
      const updates = new Map([[key, {
        suggestion: {
          status: run.everyRowFinal ? "added" as const : "waiting" as const,
          typeId: run.type.id,
          typeName: run.type.name,
          reason: run.everyRowFinal ? null : (run.lastReason ?? "Roam couldn't save these parts."),
        },
        rows: rowUpdates(run.decisions, run.type.name),
      }]]);
      await patchSavedPageResult(supabase, page.id, updates, run.pictures);
      processed += 1;
      if (run.decisions.some((d) => d.state === "held" && /checking this part now/i.test(d.reason ?? ""))) {
        busy = true;
        break;
      }
    }

    const total = await countPagesForKey(supabase, key);
    return c.json({
      ok: true,
      saved,
      pages: processed,
      remaining: Math.max(0, total - processed),
      busy,
      type: lastType,
    });
  });

  // R4: Don't track. Owner only. The owner's login is kept as p_actor; a Roam-made type with no other word is drafted.
  app.post(`${SAVED_PAGE_PREFIX}/part-names/:key/skip`, async (c: Context) => {
    if (!isOwner(c)) return c.json({ error: "Only the owner can change this" }, 403);
    const denied = guardWrite(c);
    if (denied) return denied;
    const key = String(c.req.param("key") ?? "").toUpperCase();
    if (!KEY.test(key)) return c.json({ error: "Bad name" }, 400);
    const actor = actorOf(c);

    const { data: synonym } = await supabase.from("part_term_synonym")
      .select("canonical, maintenance_component_id, added_by")
      .eq("phrase_key", key).maybeSingle();
    const { data: dismissal } = await supabase.from("part_type_suggestion_dismissal")
      .select("phrase").eq("phrase_key", key).maybeSingle();
    const pages = await pagesForKey(supabase, key, 20);
    if (!synonym && !dismissal && !pages.length) return c.json({ error: "That name isn't on file" }, 404);
    const phrase = (pages.length
      ? phraseForKey(resultOf(pages[0]), key)
      : String((dismissal as { phrase?: string } | null)?.phrase ?? ""))
      || String((synonym as { canonical?: string } | null)?.canonical ?? key);

    const { error } = await supabase.rpc("part_name_answer_set", {
      p_phrase_key: key,
      p_phrase: phrase,
      p_verdict: "skip",
      p_type_id: null,
      p_set_by: "owner",
      p_reason: "You said not tracked",
      p_actor: actor,
    });
    if (error) return c.json({ error: error.message }, 500);

    let drafted = false;
    const typeId = (synonym as { maintenance_component_id?: string } | null)?.maintenance_component_id
      ? String((synonym as { maintenance_component_id?: string }).maintenance_component_id)
      : null;
    if ((synonym as { added_by?: string } | null)?.added_by === "roam" && typeId) {
      const { count } = await supabase.from("part_term_synonym")
        .select("term", { count: "exact", head: true })
        .eq("maintenance_component_id", typeId);
      if ((count ?? 0) === 0) {
        await supabase.from("maintenance_service_categories")
          .update({ part_type_status: "draft" }).eq("id", typeId);
        drafted = true;
      }
    }

    const updates = new Map([[key, { suggestion: { status: "skipped" as const, reason: "You said not tracked" } }]]);
    for (const page of pages.slice(0, 20)) {
      try {
        await patchSavedPageResult(supabase, page.id, updates, undefined);
      } catch { /* one page's result not patched; the answer is still saved */ }
    }
    return c.json({ ok: true, drafted, pages: pages.length });
  });
}
