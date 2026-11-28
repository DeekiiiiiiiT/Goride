/**
 * Spec, car-identity and whole-model research jobs (docs/research-engine-audit.md RE-04 / RE-06 / RE-07 / RE-08).
 * Same rules as part jobs: Google suggests, only a readable trusted page (or the owner in a browser) proves.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatSupabaseError } from "../_shared/formatSupabaseError.ts";
import {
  runCatalogModelResearch,
  runCatalogSpecResearch,
  runCatalogVehicleResearch,
} from "./catalog_research_gemini.ts";
import { findEvidenceBlock, htmlToBlocks } from "./research_recipes.ts";
import {
  GROUNDING_REDIRECT_HOST,
  readSourcePage,
  resolveGroundingRedirect,
  saveBlockEvidence,
  siteDomain,
} from "./research_page_reader.ts";
import { SPEC_VALUE_SHAPES } from "./research_browser_check.ts";
import { identityTokens } from "./research_part_job.ts";
import { findCarCatalogueLink } from "./research_car_link.ts";
import { specSearchLink, specSource } from "./research_spec_source.ts";

type Job = Record<string, unknown> & { id: string; job_type: string; vehicle_catalog_id?: string | null; spec_key?: string | null; group_key?: string | null; browser_check_allowed?: boolean };
type Ctx = { job: Job; jobId: string; msgId: number; queue: string; started: number };

const MAX_READS = 4;

async function rpc(supabase: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const r = await supabase.rpc(fn, args);
  if (r.error) throw new Error(`rpc ${fn}: ${formatSupabaseError(r.error)}`);
  return r.data;
}

async function finish(supabase: SupabaseClient, ctx: Ctx, state: string, detail: Record<string, unknown>) {
  const { error } = await supabase.from("catalog_research_job")
    .update({ state, step_done: 1, updated_at: new Date().toISOString(), ...(state === "not_found" ? { next_research_at: new Date(Date.now() + 7 * 864e5).toISOString() } : {}) })
    .eq("id", ctx.jobId);
  if (error) throw new Error(formatSupabaseError(error));
  await rpc(supabase, "catalog_research_log_event", { p_job_id: ctx.jobId, p_step: "route", p_outcome: state, p_detail: detail });
  await rpc(supabase, "catalog_research_complete_msg", { p_msg_id: ctx.msgId, p_queue: ctx.queue });
  await supabase.from("catalog_research_settings").update({ last_run_ms: Date.now() - ctx.started, consecutive_failures: 0 }).eq("id", 1);
  return { ok: true, jobId: ctx.jobId, state };
}

async function sitesWithMakers(supabase: SupabaseClient) {
  const [{ data: sites }, { data: makers }] = await Promise.all([
    supabase.from("trusted_site").select("domain, automated_read"),
    supabase.from("trusted_source").select("domain, kind, maker_norm"),
  ]);
  const map = new Map<string, { automated_read: string; makers: Array<{ kind: string; maker_norm: string }> }>();
  for (const s of sites ?? []) map.set((s as { domain: string }).domain, { automated_read: (s as { automated_read: string }).automated_read, makers: [] });
  for (const m of makers ?? []) map.get((m as { domain: string }).domain)?.makers.push({ kind: (m as { kind: string }).kind, maker_norm: String((m as { maker_norm: string | null }).maker_norm ?? "") });
  return map;
}

async function openBrowserChecks(supabase: SupabaseClient): Promise<{ open: number; max: number }> {
  const [{ count }, { data: s }] = await Promise.all([
    supabase.from("catalog_research_job").select("id", { count: "exact", head: true }).eq("state", "browser_check"),
    supabase.from("catalog_research_settings").select("max_open_browser_checks").eq("id", 1).single(),
  ]);
  return { open: count ?? 0, max: Number(s?.max_open_browser_checks ?? 25) };
}

function escapeRe(s: string): RegExp {
  return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"), "i");
}

// ---------------------------------------------------------------------------------------------------- spec jobs
export async function runSpecJob(supabase: SupabaseClient, ctx: Ctx): Promise<Record<string, unknown>> {
  const { job, jobId } = ctx;
  const specKey = String(job.spec_key ?? "");
  const [{ data: car }, { data: key }] = await Promise.all([
    supabase.from("vehicle_catalog").select("make, model, chassis_code, engine_code, production_start_year, production_end_year").eq("id", job.vehicle_catalog_id).maybeSingle(),
    supabase.from("spec_key").select("key, label, unit").eq("key", specKey).maybeSingle(),
  ]);
  if (!car || !key) return await finish(supabase, ctx, "failed", { reason: "car or spec missing" });
  const c = car as Record<string, string | number | null>;
  const carLine = [c.make, c.model, c.chassis_code, c.engine_code, [c.production_start_year, c.production_end_year].filter(Boolean).join("-")].filter(Boolean).join(" ");
  const research = await runCatalogSpecResearch({ carLine, specLabel: String((key as { label: string }).label), unit: (key as { unit: string | null }).unit });
  await rpc(supabase, "catalog_research_log_event", { p_job_id: jobId, p_step: "research", p_outcome: "ok", p_detail: { model: research.model, found: Boolean(research.value), sources: research.sourceUrls.length } });

  const sites = await sitesWithMakers(supabase);
  const identity = identityTokens(c as Record<string, string>);
  const carMake = String(c.make ?? "").toLowerCase();
  const pattern = SPEC_VALUE_SHAPES[specKey] ?? (research.value ? escapeRe(research.value) : /\S{2,}/);
  let browserUrl: string | null = null;
  let reads = 0;
  for (const raw of research.sourceUrls.slice(0, 6)) {
    const url = await resolveGroundingRedirect(raw);
    if (!url) continue;
    const domain = siteDomain(new URL(url).hostname);
    if (domain === GROUNDING_REDIRECT_HOST) continue;
    const site = sites.get(domain);
    if (!site) continue;
    const carMakerSite = site.makers.some((m) => m.kind === "car_maker" && m.maker_norm === carMake);
    if (site.automated_read !== "allowed") {
      if (carMakerSite && !browserUrl) browserUrl = url;
      continue;
    }
    if (reads >= MAX_READS) break;
    reads++;
    const page = await readSourcePage({ url, purpose: "job", jobId });
    if (page.kind !== "ok") continue;
    const hit = findEvidenceBlock(htmlToBlocks(page.body), { identity, valuePattern: pattern });
    if (!hit?.value) continue;
    const route = carMakerSite ? "a" : site.makers.some((m) => m.kind === "part_maker") ? "b" : null;
    if (!route) continue; // reference sites never prove
    const readId = await saveBlockEvidence({ pageRead: page, blockText: hit.block, jobId, purpose: "job" });
    // Review #5: an added or rejected proposal stays as the owner left it.
    const { data: decided } = await supabase.from("catalog_spec_proposal").select("status")
      .eq("job_id", jobId).eq("spec_key", specKey).in("status", ["promoted", "rejected"]).maybeSingle();
    if (decided) {
      const kept = (decided as { status: string }).status;
      return await finish(supabase, ctx, kept === "promoted" ? "added" : "not_found", { proven: true, route, kept });
    }
    const { error } = await supabase.from("catalog_spec_proposal").upsert({
      job_id: jobId,
      vehicle_catalog_id: job.vehicle_catalog_id,
      spec_key: specKey,
      value: hit.value,
      unit: (key as { unit: string | null }).unit,
      evidence_read_ids: [readId],
      trust_route: route,
      route: "review",
      status: "open",
    }, { onConflict: "job_id,spec_key" });
    if (error) throw new Error(formatSupabaseError(error));
    await rpc(supabase, "trusted_site_bump_pages_confirmed", { p_domain: domain });
    return await finish(supabase, ctx, "needs_review", { proven: true, route });
  }

  // Not proven: a suggestion, plus a browser check on the car maker's catalogue when the cap allows (RE-28).
  // Review #5: a redelivered message never replaces a proven, added or rejected proposal, and an unproven value never
  // keeps an earlier run's evidence.
  const { data: earlier } = await supabase.from("catalog_spec_proposal").select("status, evidence_read_ids")
    .eq("job_id", jobId).eq("spec_key", specKey).maybeSingle();
  const prev = earlier as { status?: string; evidence_read_ids?: string[] } | null;
  const keepEarlier = Boolean(prev && (prev.status !== "open" || (prev.evidence_read_ids ?? []).length > 0));
  if (research.value && !keepEarlier) {
    await supabase.from("catalog_spec_proposal").upsert({
      job_id: jobId,
      vehicle_catalog_id: job.vehicle_catalog_id,
      spec_key: specKey,
      value: research.value,
      unit: (key as { unit: string | null }).unit,
      evidence_read_ids: [],
      trust_route: null,
      route: "review",
      status: "open",
    }, { onConflict: "job_id,spec_key" });
  }
  // Owner 27 Nov: a spec a parts catalogue never shows (bulb, tyre, oil…) → a search for any page about the car.
  if (specSource(specKey) === "any_page") {
    browserUrl = specSearchLink(c as Record<string, string | number | null>, String((key as { label: string }).label));
  }
  // NR-01: no catalogue page among the AI's sources → the car's own catalogue link (the version the owner confirmed).
  if (!browserUrl) browserUrl = await findCarCatalogueLink(supabase, { vehicleId: job.vehicle_catalog_id, carMake: carMake });
  if (browserUrl && job.browser_check_allowed !== false) {
    const { open, max } = await openBrowserChecks(supabase);
    await supabase.from("catalog_research_event").insert({ job_id: jobId, step: "browser_check", outcome: "link", detail: { url: browserUrl } });
    return await finish(supabase, ctx, open < max ? "browser_check" : "browser_check_queued", { browserCheckUrl: browserUrl, suggested: Boolean(research.value) });
  }
  return await finish(supabase, ctx, research.value ? "needs_review" : "not_found", { proven: false, suggested: Boolean(research.value) });
}

// ------------------------------------------------------------------------------------------- vehicle list jobs
type Version = {
  productionStartYear?: number | null;
  productionEndYear?: number | null;
  chassisCode?: string | null;
  engineCode?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  grade?: string | null;
  market?: string | null;
};

const up = (s: unknown) => String(s ?? "").trim().toUpperCase();

/** new / update / same against the cars already on file (RE-08). */
export function compareVersion(v: Version, existing: Array<Record<string, unknown>>): { action: "new" | "update" | "same"; existingId: string | null } {
  const match = existing.find((e) =>
    up(e.chassis_code) === up(v.chassisCode) && up(e.engine_code) === up(v.engineCode)
    && Number(e.production_start_year ?? 0) <= Number(v.productionEndYear ?? 9999)
    && Number(e.production_end_year ?? 9999) >= Number(v.productionStartYear ?? 0)
  );
  if (!match) return { action: "new", existingId: null };
  const missing = (["drivetrain", "transmission"] as const).some((k) => !String(match[k] ?? "").trim() && String(v[k] ?? "").trim());
  return { action: missing ? "update" : "same", existingId: String(match.id) };
}

export async function runVehicleListJob(supabase: SupabaseClient, ctx: Ctx): Promise<Record<string, unknown>> {
  const { job, jobId } = ctx;
  let make = "";
  let model = "";
  let only: Record<string, unknown> | null = null;
  if (job.job_type === "vehicle_identity") {
    const { data: car } = await supabase.from("vehicle_catalog").select("id, make, model, production_start_year, production_end_year, chassis_code, engine_code, drivetrain, transmission").eq("id", job.vehicle_catalog_id).maybeSingle();
    if (!car) return await finish(supabase, ctx, "failed", { reason: "car missing" });
    only = car as Record<string, unknown>;
    make = String(only.make ?? "");
    model = String(only.model ?? "");
  } else {
    const [, m1, m2] = String(job.group_key ?? "").split(":");
    make = m1 ?? "";
    model = m2 ?? "";
  }
  if (!make || !model) return await finish(supabase, ctx, "failed", { reason: "make or model missing" });

  let versions: Version[];
  if (only) {
    const r = await runCatalogVehicleResearch({
      promptContext: [`Vehicle: ${make} ${model}`, `Years: ${only.production_start_year ?? ""}-${only.production_end_year ?? ""}`,
        "Find this exact version's frame (chassis) code, frame number range, engine code, drivetrain, transmission and grade."].join("\n"),
    });
    const p = r.proposal as Record<string, unknown>;
    versions = [{
      productionStartYear: (p.productionStartYear as number) ?? (only.production_start_year as number) ?? null,
      productionEndYear: (p.productionEndYear as number) ?? (only.production_end_year as number) ?? null,
      chassisCode: (p.chassisCode as string) ?? null,
      engineCode: (p.engineCode as string) ?? null,
      drivetrain: (p.drivetrain as string) ?? null,
      transmission: (p.transmission as string) ?? null,
      market: (p.market as string) ?? null,
    }];
  } else {
    versions = (await runCatalogModelResearch({ make, model })).versions as Version[];
  }
  versions = versions.filter((v) => v && (v.chassisCode || v.engineCode));
  if (versions.length === 0) return await finish(supabase, ctx, "not_found", { versions: 0 });

  const { data: existing } = await supabase.from("vehicle_catalog")
    .select("id, chassis_code, engine_code, production_start_year, production_end_year, drivetrain, transmission")
    .ilike("make", make).ilike("model", model).is("retired_at", null);

  const rows = versions.map((v) => {
    const cmp = only ? { action: "update" as const, existingId: String(only.id) } : compareVersion(v, (existing ?? []) as Array<Record<string, unknown>>);
    return {
      job_id: jobId,
      make,
      model,
      production_start_year: v.productionStartYear ?? null,
      production_end_year: v.productionEndYear ?? null,
      chassis_code: v.chassisCode ?? null,
      engine_code: v.engineCode ?? null,
      drivetrain: v.drivetrain ?? null,
      transmission: v.transmission ?? null,
      grade: v.grade ?? null,
      market: v.market ?? null,
      existing_vehicle_catalog_id: cmp.existingId,
      action: cmp.action,
      checks: { trust: "needs_checking" },
      status: "open",
    };
  });
  // RE-22: one row per version even when the message is delivered twice.
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const k = [r.chassis_code, r.engine_code, r.production_start_year].join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const { error } = await supabase.from("catalog_vehicle_proposal").upsert(unique, { onConflict: "job_id,chassis_code,engine_code,production_start_year" });
  if (error) throw new Error(formatSupabaseError(error));
  return await finish(supabase, ctx, "needs_review", {
    versions: unique.length,
    new: unique.filter((r) => r.action === "new").length,
    update: unique.filter((r) => r.action === "update").length,
    same: unique.filter((r) => r.action === "same").length,
  });
}

