/**
 * SP-01 (docs/saved-page-parts-audit.md §4 R8): the one save path for a browser check's answers.
 *
 * The step-by-step check (research_engine_routes.ts), the saved-page route and the auto-sort's Track it all call
 * savePartAnswers, so a number is proved, proposed, promoted and listed in exactly one place. A saved page adds its
 * own row reference (savedPageId) to the evidence read, and a save with no person behind it is marked as Roam's own
 * (`roam_saved_page`), never as somebody's browser check (S1c bug 1).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { autoResolveFromBatch } from "./catalog_request_autoresolve.ts";
import { confirmedPartKind, type PositionItem } from "./research_browser_check.ts";

export type SaveJob = {
  id: string;
  job_type: string;
  state: string;
  vehicle_catalog_id: string | null;
  maintenance_component_id: string | null;
  spec_key: string | null;
  fit_descriptor: string | null;
};

/** What the gate proved, ready to save. `items` are the numbers with their places and build years (RE-69). */
export type SaveAnswers = {
  job: SaveJob;
  car: Record<string, string | null>;
  host: string;
  /** True when the number came from the car maker's own catalogue (it is the maker's part, OEM). */
  carMakerPage: boolean;
  detected: string;
  versionCode: string | null;
  items?: PositionItem[] | null;
  actor: string | null;
};

export type SaveResult = {
  ok: true;
  jobType: "part" | "spec";
  /** The last promote result, as the confirm route has always returned it. */
  result: unknown;
  results: Array<{ number: string; places: string[]; result: unknown }>;
  detected: string;
} | {
  ok: false;
  error: string;
  /** What was saved before the failing number, as before. */
  saved: Array<{ number: string; places: string[]; result: unknown }>;
};

/**
 * Who a page read belongs to, and the one rule the database enforces on it (`research_page_read`):
 *  - 'owner_browser': a person checked the page in their browser — checked_by is their login, required.
 *  - 'roam_saved_page': Roam saved from a page the owner had already uploaded — checked_by is NULL, because Roam is
 *    not a user (migration 20261126201702, S1c bug 1).
 *  - 'direct': the robot fetched the page itself — checked_by is NULL.
 */
export type ResearchReadPath = "direct" | "owner_browser" | "roam_saved_page";

export const ROAM_FROM_SAVED_PAGE: ResearchReadPath = "roam_saved_page";

/**
 * S1c bug 1: the honest identity of this save. A person's save names them (`owner_browser`). A save with no person
 * is Roam's, and only a saved page can honestly carry one; without a saved page there is no identity to write, so
 * the save is refused rather than claimed as somebody's browser check.
 */
function readPathFor(actor: string | null, savedPageId: string | null): ResearchReadPath | null {
  if (actor) return "owner_browser";
  if (savedPageId) return ROAM_FROM_SAVED_PAGE;
  return null;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * RE-63: remember the catalogue's own name and page for this car's version on this site. Used by the step-by-step check
 * and by the saved-page route (when it passed R4 and this site had no remembered version).
 */
export async function rememberCarSiteVersion(
  supabase: SupabaseClient,
  input: {
    carId: string | null | undefined;
    host: string;
    versionCode: string | null;
    pageUrl: string | null;
    periodText?: string | null;
    actor: string | null;
  },
): Promise<void> {
  if (!input.versionCode || !input.carId) return;
  const { error } = await supabase.from("research_car_site_version").upsert({
    vehicle_catalog_id: input.carId,
    domain: input.host,
    version_code: input.versionCode,
    version_url: input.pageUrl,
    ...(input.periodText ? { prod_period: input.periodText } : {}),
    confirmed_by: input.actor,
    confirmed_at: new Date().toISOString(),
  }, { onConflict: "vehicle_catalog_id,domain" });
  if (error) console.warn("research_car_site_version upsert failed", error.message);
}

/**
 * Save one confirmed answer set on its job: evidence read, proposal, promote, listings, auto-resolve, expire old checks.
 * Spans (spec) save like the confirm route always did; part numbers save one entry per number with every place it was
 * confirmed for (RE-69).
 */
/**
 * A save changes what is Confirmed for a car, so the car's parts readiness (Coverage cards, Fleet "parts ready") must be
 * recalculated. This only marks it out of date; the 10-minute parts-readiness-catch-up job rebuilds it. The other save
 * paths already call it; promote_part_proposal did not, so a browser-check or saved-page save left a Coverage card on
 * "Not started" (Roomy cabin filter, 26 Nov). Best effort: a failed mark never fails the save.
 */
async function markReadinessOutOfDate(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.rpc("refresh_variant_parts_readiness");
  } catch {
    // The nightly rebuild catches it up.
  }
}

export async function savePartAnswers(
  supabase: SupabaseClient,
  jobId: string,
  answers: SaveAnswers,
  url: string,
  evidence: string,
  savedPageId: string | null = null,
): Promise<SaveResult> {
  const ctx = { job: answers.job, car: answers.car };
  const host = answers.host;
  const actor = answers.actor;
  const detected = answers.detected;
  const positionItems = answers.items ?? null;

  const readPath = readPathFor(actor, savedPageId);
  if (!readPath) {
    return { ok: false, error: "A person has to check this page before Roam can save it", saved: [] };
  }

  const { data: read, error: readErr } = await supabase.from("research_page_read").insert({
    job_id: jobId,
    purpose: "job",
    path: readPath,
    domain: host,
    url,
    final_url: url,
    block_text: evidence,
    block_hash: await sha256(evidence),
    checked_by: readPath === "owner_browser" ? actor : null,
    saved_page_id: savedPageId,
  }).select("id").single();
  if (readErr) return { ok: false, error: readErr.message, saved: [] };
  const readId = String((read as { id: string }).id);

  if (ctx.job.job_type === "spec") {
    const { data: prop, error } = await supabase.from("catalog_spec_proposal").upsert({
      job_id: jobId,
      vehicle_catalog_id: ctx.job.vehicle_catalog_id,
      spec_key: ctx.job.spec_key,
      value: detected,
      evidence_read_ids: [readId],
      trust_route: "owner_browser",
      route: "review",
      status: "open",
    }, { onConflict: "job_id,spec_key" }).select("id").single();
    if (error) return { ok: false, error: error.message, saved: [] };
    const { data, error: pErr } = await supabase.rpc("promote_spec_proposal", {
      p_proposal_id: (prop as { id: string }).id,
      p_actor: actor,
    });
    if (pErr) return { ok: false, error: pErr.message, saved: [] };
    await supabase.rpc("catalog_research_expire_browser_checks");
    await markReadinessOutOfDate(supabase);
    return { ok: true, jobType: "spec", result: data, results: [], detected };
  }

  // Part: the number(s) the owner saw on the car maker's catalogue (owner-checked, RE-29). RE-69: parts that come in
  // positions save one entry per number, listing each position it was confirmed for.
  const { data: comp } = await supabase.from("maintenance_service_categories").select("name")
    .eq("id", ctx.job.maintenance_component_id).maybeSingle();
  const fit = String(ctx.job.fit_descriptor ?? "").toLowerCase();
  const jobAxle = fit.includes("rear") ? "rear" : fit.includes("front") ? "front" : "";
  // RE-70: a number that changed during the build carries the build years it is for.
  type Place = { axle: string; side: string | null; yearFrom: number | null; yearTo: number | null; periodText: string | null };
  type Group = { number: string; places: Place[] };
  const groups = new Map<string, Group>();
  if (positionItems && positionItems.length) {
    for (const it of positionItems) {
      const k = it.detected.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const g = groups.get(k) ?? { number: it.detected, places: [] };
      g.places.push({
        axle: it.axle ?? jobAxle,
        side: it.side,
        yearFrom: it.yearFrom ?? null,
        yearTo: it.yearTo ?? null,
        periodText: it.periodText ?? null,
      });
      groups.set(k, g);
    }
  } else {
    groups.set(detected.toUpperCase().replace(/[^A-Z0-9]/g, ""), {
      number: detected,
      places: [{ axle: jobAxle, side: null, yearFrom: null, yearTo: null, periodText: null }],
    });
  }
  const results: Array<{ number: string; places: string[]; result: unknown }> = [];
  const savedIds = new Set<string>();
  const placeText = (g: Group) =>
    g.places.map((p) => [`${p.axle}${p.side ? ` ${p.side}` : ""}`.trim() || "this car", p.periodText ?? ""].filter(Boolean).join(" "));
  const partial = (g: Group, why: string): SaveResult => {
    const saved = results.map((r) => `${r.places.join(", ")} ${r.number}`).join("; ");
    return {
      ok: false,
      saved: results,
      error: saved
        ? `Saved ${saved}. Couldn't save ${placeText(g).join(", ")} ${g.number}: ${why}`
        : why,
    };
  };
  for (const [norm, g] of groups) {
    // Listings: one per axle (and build years, RE-70); both sides of an axle on the same number → side "both".
    const byAxle = new Map<string, { axle: string; yearFrom: number | null; yearTo: number | null; sides: Set<string> }>();
    for (const p of g.places) {
      const key = `${p.axle}|${p.yearFrom ?? ""}|${p.yearTo ?? ""}`;
      const e = byAxle.get(key) ?? { axle: p.axle, yearFrom: p.yearFrom, yearTo: p.yearTo, sides: new Set<string>() };
      if (p.side) e.sides.add(p.side);
      byAxle.set(key, e);
    }
    const listings = [...byAxle.values()].map(({ axle, yearFrom, yearTo, sides }) => {
      const side = sides.size === 2 ? "both" : sides.size === 1 ? [...sides][0] : undefined;
      return {
        vehicleId: ctx.job.vehicle_catalog_id,
        position: axle || undefined,
        ...(side ? { side } : {}),
        ...(yearFrom != null ? { yearFrom } : {}),
        ...(yearTo != null ? { yearTo } : {}),
      };
    });
    // The proposal keeps the lookup's own axle as its key (the worker's suggestion row is updated, not duplicated);
    // the exact places live in its listings.
    const positionKey = jobAxle;
    // The suggestion the owner confirmed keeps its own brand and kind (a part maker's number stays aftermarket).
    const { data: existingRows } = await supabase.from("catalog_part_proposal").select("id, brand, part_name, match_kind")
      .eq("job_id", jobId).eq("part_number_norm", norm).order("created_at").limit(1);
    const existing = (existingRows ?? [])[0] as { brand?: string; part_name?: string; match_kind?: string } | undefined;
    const kind = confirmedPartKind(answers.carMakerPage, ctx.car.make, existing);
    const { data: prop, error } = await supabase.from("catalog_part_proposal").upsert({
      job_id: jobId,
      brand: kind.brand,
      part_number: g.number,
      part_number_norm: norm,
      part_name: existing?.part_name ?? comp?.name ?? "Part",
      position_key: positionKey,
      match_kind: kind.matchKind,
      trust_route: "owner_browser",
      evidence_read_ids: [readId],
      fits: { listings },
      sources: [{ url, domain: host, readId, block: evidence }],
      route: "review",
      status: "open",
    }, { onConflict: "job_id,part_number_norm,position_key" }).select("id").single();
    if (error) return partial(g, error.message);
    const { data: done, error: pErr } = await supabase.rpc("promote_part_proposal", {
      p_proposal_id: (prop as { id: string }).id,
      p_actor: actor,
    });
    if (pErr) return partial(g, pErr.message);
    savedIds.add((prop as { id: string }).id);
    results.push({ number: g.number, places: placeText(g), result: done });
    const batchId = (done as { batchId?: string } | null)?.batchId;
    if (batchId) await autoResolveFromBatch(supabase, batchId, actor);
  }
  // The owner checked the real page, so the robot's other guesses on this job are not the answer: set them aside
  // (kept, with a reason) so they stop showing as "Needs checking" next to the saved numbers (26 Nov).
  const { data: leftovers } = await supabase.from("catalog_part_proposal").select("id")
    .eq("job_id", jobId).eq("status", "open");
  for (const row of (leftovers ?? []) as Array<{ id: string }>) {
    if (savedIds.has(row.id)) continue;
    await supabase.from("catalog_part_proposal")
      .update({ status: "rejected", rejected_reason: "not on the catalogue page the owner checked" })
      .eq("id", row.id).eq("status", "open");
  }
  await supabase.rpc("catalog_research_expire_browser_checks");
  if (results.length) await markReadinessOutOfDate(supabase);
  return { ok: true, jobType: "part", result: results[results.length - 1]?.result ?? null, results, detected };
}
