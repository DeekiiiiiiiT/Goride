/**
 * Catalog research worker tick (audit B3).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatSupabaseError } from "../_shared/formatSupabaseError.ts";
import {
  domainFromGroundingTitle,
  runCatalogPartResearch,
  runCatalogVehicleResearch,
} from "./catalog_research_gemini.ts";
import { finalizeCatalogJobNotFound, sweepUnansweredNotFound } from "./catalog_research_not_found.ts";
import {
  geminiHttpErrorDetail,
  runPartGeminiResearchWithRetry,
} from "./catalog_research_part_research.ts";
import {
  checkPartNumberShape,
  normalizeResearchCandidate,
} from "./catalog_research_number_shape.ts";
import { classifyGeminiProviderError } from "./catalog_research_provider.ts";
import { routeBySourceRule, type RuleProposal, type SourcePass } from "./catalog_research_route.ts";
import {
  GROUNDING_REDIRECT_HOST,
  readSourcePage,
  resolveGroundingRedirect,
  saveBlockEvidence,
  siteDomain,
} from "./research_page_reader.ts";
import { fillTemplate, findEvidenceBlock, htmlToBlocks, type LookupRecipe, runRecipe } from "./research_recipes.ts";
import {
  brandNorm,
  buildPartPromptContext,
  buildPartSearchQuery,
  decideJobOutcome,
  identityTokens,
  positionKeyFor,
  positionTokens,
  slotKeyFor,
} from "./research_part_job.ts";
import { autoResolveFromBatch } from "./catalog_request_autoresolve.ts";
import { runSpecJob, runVehicleListJob } from "./research_other_jobs.ts";

export const ENGINE_REV = "catalog-research-7";

function throwOnSupabaseError(label: string, result: { error: unknown }): void {
  if (result.error) throw new Error(`${label}: ${formatSupabaseError(result.error)}`);
}

async function supabaseRpc(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await supabase.rpc(fn, args);
  throwOnSupabaseError(`rpc ${fn}`, result);
  return result.data;
}

async function supabaseUpdate(
  supabase: SupabaseClient,
  table: string,
  patch: Record<string, unknown>,
  filter: (q: ReturnType<SupabaseClient["from"]>) => ReturnType<ReturnType<SupabaseClient["from"]>["eq"]>,
): Promise<void> {
  const result = await filter(supabase.from(table).update(patch));
  throwOnSupabaseError(`update ${table}`, result);
}

async function supabaseInsert(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown> | Array<Record<string, unknown>>,
): Promise<void> {
  const result = await supabase.from(table).insert(rows);
  throwOnSupabaseError(`insert ${table}`, result);
}

export const TICK_BUDGET_MS = 90_000;
export const MAX_READS_PER_JOB = 4;

type TrustedSite = {
  domain: string;
  automated_read: "allowed" | "blocked" | "not_checked";
  makers: Array<{ kind: "car_maker" | "part_maker" | "reference"; maker_norm: string }>;
};

/** One list (RE-11): sites with their reading state and the makers each speaks for. */
async function loadTrustedSites(supabase: SupabaseClient): Promise<TrustedSite[]> {
  const [{ data: sites, error: sErr }, { data: makers, error: mErr }] = await Promise.all([
    supabase.from("trusted_site").select("domain, automated_read"),
    supabase.from("trusted_source").select("domain, kind, maker_norm"),
  ]);
  if (sErr) throw sErr;
  if (mErr) throw mErr;
  const byDomain = new Map<string, TrustedSite>();
  for (const s of sites ?? []) {
    const row = s as { domain: string; automated_read: TrustedSite["automated_read"] };
    byDomain.set(row.domain, { domain: row.domain, automated_read: row.automated_read, makers: [] });
  }
  for (const m of makers ?? []) {
    const row = m as { domain: string; kind: TrustedSite["makers"][number]["kind"]; maker_norm: string | null };
    byDomain.get(row.domain)?.makers.push({ kind: row.kind, maker_norm: String(row.maker_norm ?? "") });
  }
  return [...byDomain.values()];
}

async function loadBrandAliases(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("brand_alias").select("alias_norm, brand");
  if (error) throw error;
  return new Map((data ?? []).map((r) => [String((r as { alias_norm: string }).alias_norm), String((r as { brand: string }).brand)]));
}

async function loadActiveRecipes(supabase: SupabaseClient): Promise<LookupRecipe[]> {
  const { data, error } = await supabase.from("research_lookup_recipe")
    .select("id, domain, kind, search_url_template, result_link_rule, block_rule").eq("active", true);
  if (error) throw error;
  return (data ?? []) as LookupRecipe[];
}

/** RE-18: part makers on the trusted list + brand aliases + part_master brands. */
async function loadKnownManufacturers(supabase: SupabaseClient): Promise<string[]> {
  const [{ data: pm, error }, { data: ts }, { data: al }] = await Promise.all([
    supabase.from("part_master").select("manufacturer").not("manufacturer", "is", null).limit(800),
    supabase.from("trusted_source").select("maker").eq("kind", "part_maker"),
    supabase.from("brand_alias").select("brand"),
  ]);
  if (error) throw error;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [
    ...(al ?? []).map((r) => String((r as { brand: string }).brand)),
    ...(ts ?? []).map((r) => String((r as { maker: string }).maker)),
    ...(pm ?? []).map((r) => String((r as { manufacturer: string }).manufacturer)),
  ]) {
    const v = m.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

export async function handleGeminiProviderFault(
  supabase: SupabaseClient,
  input: {
    jobId: string;
    msgId: number;
    queue: string;
    provider: ReturnType<typeof classifyGeminiProviderError>;
  },
): Promise<Record<string, unknown>> {
  const provider = input.provider!;
  await supabaseRpc(supabase, "catalog_research_complete_msg", { p_msg_id: input.msgId, p_queue: input.queue });
  await supabaseRpc(supabase, "catalog_research_enqueue_job", { p_job_id: input.jobId });
  await supabaseUpdate(supabase, "catalog_research_job", {
    state: "queued",
    last_error: provider.pausedReason,
    pgmq_msg_id: null,
    pgmq_queue: null,
    pgmq_read_ct: 0,
    updated_at: new Date().toISOString(),
  }, (q) => q.eq("id", input.jobId));

  const patch: Record<string, unknown> = {
    paused: true,
    paused_reason: provider.pausedReason,
    consecutive_failures: 0,
  };
  if (provider.autoResumeMinutes != null) {
    patch.auto_resume_at = new Date(Date.now() + provider.autoResumeMinutes * 60_000).toISOString();
    if (provider.countsAsRetry) {
      const { data: settings, error: settingsErr } = await supabase.from("catalog_research_settings").select("auto_resume_attempt").eq("id", 1).single();
      throwOnSupabaseError("select catalog_research_settings", { error: settingsErr });
      patch.auto_resume_attempt = (settings?.auto_resume_attempt || 0) + 1;
    } else {
      // A daily / monthly limit is a scheduled pause, not a failure: it never uses up resume attempts (RE-10).
      patch.auto_resume_attempt = 0;
    }
  } else {
    patch.auto_resume_at = null;
  }
  await supabaseUpdate(supabase, "catalog_research_settings", patch, (q) => q.eq("id", 1));
  await supabaseRpc(supabase, "catalog_research_log_event", {
    p_job_id: input.jobId,
    p_step: "recovery",
    p_outcome: "paused_provider",
    p_detail: { httpStatus: provider.httpStatus, reason: provider.pausedReason, cause: provider.cause },
  });
  return { ok: true, paused: true, reason: provider.pausedReason, jobId: input.jobId };
}

export async function runCatalogResearchWorker(supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const started = Date.now();
  // Review #9: asks whose job became Couldn't find outside the worker (e.g. the 30-day browser-check expiry) get their answer.
  await sweepUnansweredNotFound(supabase).catch((e) => console.warn("[catalog-research] not-found sweep", e));
  const { data: claim, error: claimErr } = await supabase.rpc("catalog_research_claim");
  if (claimErr) throw new Error(formatSupabaseError(claimErr));
  if (!claim?.claimed) {
    return { ok: true, skipped: claim?.reason || "none" };
  }

  const jobId = String(claim.jobId);
  const msgId = Number(claim.msgId);
  const queue = claim.queue ? String(claim.queue) : "catalog_research";

  try {
    const { data: job, error: jobErr } = await supabase.from("catalog_research_job").select("*").eq("id", jobId).single();
    if (jobErr) throw jobErr;

    if (job.job_type === "vehicle") {
      // RE-07: the job's own request, never "the newest pending request". Car facts only, no company data.
      const { data: pending } = job.pending_request_id
        ? await supabase
          .from("vehicle_catalog_pending_requests")
          .select("proposed_make, proposed_model, proposed_year, proposed_trim_series, proposed_body_type")
          .eq("id", job.pending_request_id)
          .maybeSingle()
        : { data: null };
      const [, keyMake, keyModel, keyYear] = String(job.group_key || "").split(":");
      const make = pending?.proposed_make || keyMake || "";
      const model = pending?.proposed_model || keyModel || "";
      const year = pending?.proposed_year || (keyYear ? Number(keyYear) : null);

      const research = await runCatalogVehicleResearch({
        promptContext: [
          `Proposed vehicle: ${make} ${model}`,
          `Year: ${year ?? ""}`,
          pending?.proposed_trim_series ? `Trim / series: ${pending.proposed_trim_series}` : "",
          pending?.proposed_body_type ? `Body: ${pending.proposed_body_type}` : "",
        ].filter(Boolean).join("\n"),
      });

      await supabaseRpc(supabase, "catalog_research_log_event", {
        p_job_id: jobId,
        p_step: "research",
        p_outcome: "ok",
        p_detail: { model: research.model },
      });

      const prop = research.proposal;
      // RE-22: a redelivered message updates the same proposal instead of adding another.
      const { error: vpErr } = await supabase.from("catalog_vehicle_proposal").upsert({
        job_id: jobId,
        make: prop.make ?? make,
        model: prop.model ?? model,
        production_start_year: prop.productionStartYear ?? year,
        production_end_year: prop.productionEndYear ?? null,
        chassis_code: prop.chassisCode ?? null,
        engine_code: prop.engineCode ?? null,
        drivetrain: prop.drivetrain ?? null,
        transmission: prop.transmission ?? null,
        market: prop.market ?? job.market ?? "JM",
        sources: prop.sources ?? [],
        checks: { model: research.model, trust: "needs_checking" },
        action: "new",
      }, { onConflict: "job_id,chassis_code,engine_code,production_start_year" });
      if (vpErr) throw vpErr;

      await supabaseUpdate(supabase, "catalog_research_job", { state: "needs_review", updated_at: new Date().toISOString() }, (q) => q.eq("id", jobId));
      await supabaseRpc(supabase, "catalog_research_log_event", {
        p_job_id: jobId,
        p_step: "route",
        p_outcome: "needs_review",
        p_detail: { vehicle: true },
      });
      await supabaseRpc(supabase, "catalog_research_complete_msg", { p_msg_id: msgId, p_queue: queue });
      await supabaseUpdate(supabase, "catalog_research_settings", { last_run_ms: Date.now() - started, consecutive_failures: 0 }, (q) => q.eq("id", 1));
      return { ok: true, jobId, vehicleReview: true };
    }

    // RE-06 / RE-04 / RE-08: specs, a car's identity and whole models.
    if (job.job_type === "spec") {
      return await runSpecJob(supabase, { job, jobId, msgId, queue, started });
    }
    if (job.job_type === "vehicle_identity" || job.job_type === "vehicle_model") {
      return await runVehicleListJob(supabase, { job, jobId, msgId, queue, started });
    }
    if (job.job_type !== "part") {
      throw new Error(`unknown job type ${job.job_type}`);
    }

    const { data: vc } = await supabase.from("vehicle_catalog").select("*").eq("id", job.vehicle_catalog_id).maybeSingle();
    const { data: comp } = await supabase.from("maintenance_service_categories").select("name").eq("id", job.maintenance_component_id).maybeSingle();
    const partTypeName = String(comp?.name || "");

    await supabaseUpdate(supabase, "catalog_research_job", { state: "researching" }, (q) => q.eq("id", jobId));

    const sites = await loadTrustedSites(supabase);
    const aliases = await loadBrandAliases(supabase);
    // RE-27: Google gets the car, the part type and the fit — never request text or notes.
    const geminiInput = {
      promptContext: buildPartPromptContext({
        car: vc ?? {},
        partTypeName,
        fitDescriptor: job.fit_descriptor,
        candidateNumber: job.requested_part_number,
      }),
      searchQuery: buildPartSearchQuery(vc ?? {}, partTypeName),
      trustedDomains: sites.filter((s) => s.automated_read === "allowed").map((s) => s.domain),
    };

    let researchResult: Awaited<ReturnType<typeof runPartGeminiResearchWithRetry>>;
    try {
      researchResult = await runPartGeminiResearchWithRetry(
        () => runCatalogPartResearch(geminiInput),
        async () => {
          await supabaseRpc(supabase, "catalog_research_log_event", {
            p_job_id: jobId,
            p_step: "research",
            p_outcome: "retry_search",
            p_detail: { reason: "zero_grounding_chunks" },
          });
        },
      );
    } catch (researchErr) {
      const httpDetail = geminiHttpErrorDetail(researchErr);
      if (httpDetail?.status === 400) {
        await supabaseRpc(supabase, "catalog_research_log_event", {
          p_job_id: jobId,
          p_step: "research",
          p_outcome: "gemini_http_400",
          p_detail: { httpStatus: 400, body: httpDetail.bodySnippet },
        });
      }
      throw researchErr;
    }

    const { research, attempts, groundingChunks } = researchResult;
    const sourceUrls = research.candidates.reduce((n, c) => n + (c.sources?.length || 0), 0);

    if (groundingChunks === 0 || research.candidates.length === 0) {
      await finalizeCatalogJobNotFound(supabase, {
        jobId,
        groupKey: String(job.group_key),
        msgId,
        queue,
        eventDetail: { groundingChunks, sourceUrls, attempts, model: research.model },
      });
      await supabaseUpdate(supabase, "catalog_research_settings", {
        last_run_ms: Date.now() - started,
        consecutive_failures: 0,
      }, (q) => q.eq("id", 1));
      return { ok: true, jobId, state: "not_found", noSearchResults: true };
    }

    await supabaseRpc(supabase, "catalog_research_log_event", {
      p_job_id: jobId,
      p_step: "research",
      p_outcome: "ok",
      p_detail: { model: research.model, count: research.candidates.length, groundingChunks, sourceUrls, attempts },
    });

    const { error: reopenErr } = await supabase
      .from("parts_sourcing_requests")
      .update({ status: "in_progress", cant_find_at: null, cant_find_reason: null })
      .eq("catalog_research_job_id", jobId)
      .eq("kind", "add_part_info")
      .eq("status", "rejected");
    if (reopenErr) throw reopenErr;

    await supabaseUpdate(supabase, "catalog_research_job", { state: "checking" }, (q) => q.eq("id", jobId));

    const knownManufacturers = await loadKnownManufacturers(supabase);
    const recipes = await loadActiveRecipes(supabase);
    const identity = identityTokens(vc ?? {});
    const position = positionTokens(job.fit_descriptor);
    const positionKey = positionKeyFor(job.fit_descriptor);
    const slotKey = slotKeyFor(job);
    const carMakerNorm = String(vc?.make || "").trim().toLowerCase();
    const siteByDomain = new Map(sites.map((s) => [s.domain, s]));

    const proposalRows: Array<Record<string, unknown>> = [];
    const tempNorm = new Map<string, string>();
    const ruleInput: RuleProposal[] = [];
    let browserCheckUrl: string | null = null;
    let pageReads = 0;
    const deadline = started + TICK_BUDGET_MS;

    for (const cand of research.candidates.slice(0, 5)) {
      const normalized = normalizeResearchCandidate(cand.brand, cand.partNumber, knownManufacturers);
      if ([...tempNorm.values()].includes(normalized.partNumberNorm)) continue;
      const shape = checkPartNumberShape(normalized.brand, normalized.partNumber);
      const passes: SourcePass[] = [];
      const verifiedSources: Array<Record<string, unknown>> = [];
      const check = { number: normalized.partNumber, identity, position };

      // 1. Catalogue-first: every active by-part-number recipe on a readable site (RE-02).
      for (const recipe of recipes) {
        const site = siteByDomain.get(recipe.domain);
        if (!site) continue;
        if (recipe.kind === "browser_check_link") {
          if (!browserCheckUrl && site.makers.some((m) => m.kind === "car_maker" && m.maker_norm === carMakerNorm)) {
            browserCheckUrl = fillTemplate(recipe.search_url_template || "", {
              number: normalized.partNumber,
              chassis: vc?.chassis_code,
              model: vc?.model,
              make: vc?.make,
              engine: vc?.engine_code,
            });
          }
          continue;
        }
        if (site.automated_read !== "allowed" || pageReads >= MAX_READS_PER_JOB || Date.now() > deadline) continue;
        pageReads += recipe.kind === "search_then_page" ? 2 : 1;
        const result = await runRecipe(recipe, {
          number: normalized.partNumber,
          chassis: vc?.chassis_code,
          model: vc?.model,
          make: vc?.make,
          engine: vc?.engine_code,
        }, check, { purpose: "job", jobId });
        if (result.kind === "found") {
          const readId = await saveBlockEvidence({ pageRead: result.pageRead, blockText: result.block, jobId, recipeId: recipe.id, purpose: "job" });
          for (const m of site.makers) {
            passes.push({ domain: site.domain, kind: m.kind, makerNorm: m.maker_norm, path: "direct", readId: String(readId) });
          }
          verifiedSources.push({ url: result.pageRead.finalUrl, domain: site.domain, recipeId: recipe.id, readId, block: result.block });
          await supabaseRpc(supabase, "trusted_site_bump_pages_confirmed", { p_domain: site.domain });
        } else {
          verifiedSources.push({ domain: site.domain, recipeId: recipe.id, dropped: true, reason: result.kind === "unreadable" ? result.outcome.kind : result.kind === "not_found" ? result.reason : result.kind });
        }
      }

      // 2. Pages Google found, read only when they sit on a readable trusted site (RE-01 / RE-03).
      for (const src of (cand.sources || []).slice(0, 3)) {
        // Google's links are redirects through its own service; ask Google where it leads first.
        const titleDomain = domainFromGroundingTitle(String((src as { grounding_title?: string }).grounding_title || ""));
        if (titleDomain && !siteByDomain.has(siteDomain(titleDomain))) {
          verifiedSources.push({ domain: titleDomain, dropped: true, reason: "not_a_trusted_site" });
          continue;
        }
        const url = (await resolveGroundingRedirect(String(src.url || ""))) || "";
        let domain = "";
        try {
          domain = siteDomain(new URL(url).hostname);
        } catch {
          // unresolved redirect or bad url
        }
        if (!domain || domain === GROUNDING_REDIRECT_HOST) {
          verifiedSources.push({ domain: titleDomain || null, dropped: true, reason: "search_redirect_unresolved" });
          continue;
        }
        const site = siteByDomain.get(domain);
        if (!site) {
          verifiedSources.push({ url, domain, dropped: true, reason: "not_a_trusted_site" });
          continue;
        }
        if (site.automated_read !== "allowed") {
          if (!browserCheckUrl && site.makers.some((m) => m.kind === "car_maker" && m.maker_norm === carMakerNorm)) {
            browserCheckUrl = url;
          }
          verifiedSources.push({ url, domain, dropped: true, reason: `site_${site.automated_read}` });
          continue;
        }
        if (pageReads >= MAX_READS_PER_JOB || Date.now() > deadline) {
          verifiedSources.push({ url, domain, dropped: true, reason: "read_budget_used" });
          continue;
        }
        pageReads += 1;
        const page = await readSourcePage({ url, purpose: "job", jobId });
        if (page.kind !== "ok") {
          verifiedSources.push({ url, domain, dropped: true, reason: page.kind === "refused" || page.kind === "failed" || page.kind === "blocked" ? page.reason : page.kind });
          continue;
        }
        const hit = findEvidenceBlock(htmlToBlocks(page.body), check);
        if (!hit) {
          verifiedSources.push({ url, domain, readId: page.readId, dropped: true, reason: "no_block_with_number_and_car" });
          continue;
        }
        const readId = await saveBlockEvidence({ pageRead: page, blockText: hit.block, jobId, purpose: "job" });
        for (const m of site.makers) {
          passes.push({ domain, kind: m.kind, makerNorm: m.maker_norm, path: "direct", readId: String(readId) });
        }
        verifiedSources.push({ url, domain, readId, block: hit.block });
        await supabaseRpc(supabase, "trusted_site_bump_pages_confirmed", { p_domain: domain });
      }

      const propId = crypto.randomUUID();
      const bNorm = brandNorm(normalized.brand, aliases);
      tempNorm.set(propId, normalized.partNumberNorm);
      proposalRows.push({
        _tempId: propId,
        job_id: jobId,
        brand: normalized.brand,
        part_number: normalized.partNumber,
        part_number_norm: normalized.partNumberNorm,
        part_name: cand.partName || partTypeName,
        match_type: String(cand.matchType || job.match_type || ""),
        position_key: positionKey,
        // RE-13: the fit is this job's car + place, never the model's free text.
        fits: { listings: [{ vehicleId: job.vehicle_catalog_id, position: positionKey || undefined }] },
        sources: verifiedSources,
        checks: { shape, passes: passes.map((p) => ({ domain: p.domain, kind: p.kind, maker: p.makerNorm })) },
        route: "review",
      });
      ruleInput.push({
        id: propId,
        slotKey,
        partNumberNorm: normalized.partNumberNorm,
        brandNorm: bNorm,
        carMakerNorm,
        shape,
        passes,
      });
    }

    const { data: settings } = await supabase.from("catalog_research_settings")
      .select("shadow_mode, max_open_browser_checks").eq("id", 1).single();
    const routed = routeBySourceRule({ proposals: ruleInput, shadowMode: settings?.shadow_mode !== false });
    const routeById = new Map(routed.map((r) => [r.id, r]));
    for (const row of proposalRows) {
      const r = routeById.get(String(row._tempId));
      if (!r) continue;
      row.route = r.route;
      row.trust_route = r.trustRoute;
      row.evidence_read_ids = r.evidenceReadIds;
      row.match_kind = r.trustRoute === "a" || r.trustRoute === "owner_browser" ? "oem" : "aftermarket";
      row.checks = { ...(row.checks as Record<string, unknown>), trust: r.trust, shadowWouldAuto: r.shadowWouldAuto, conflict: r.conflict, browserCheckUrl };
    }

    // RE-22: a redelivered message updates the same proposal rows instead of adding new ones.
    if (proposalRows.length) {
      const rows = proposalRows.map(({ _tempId: _t, ...rest }) => rest);
      const { data: saved, error: upErr } = await supabase.from("catalog_part_proposal")
        .upsert(rows, { onConflict: "job_id,part_number_norm,position_key" })
        .select("id, part_number_norm");
      if (upErr) throw upErr;
      const idByNorm = new Map((saved ?? []).map((s) => [String((s as { part_number_norm: string }).part_number_norm), String((s as { id: string }).id)]));
      for (const r of routed) {
        const real = idByNorm.get(tempNorm.get(r.id) ?? "");
        if (real) r.id = real;
      }
    }

    // RE-19: two confirmed numbers for one slot → one open conflict for the owner.
    const conflictIds = routed.filter((r) => r.conflict).map((r) => r.id);
    if (conflictIds.length >= 2) {
      const { error: cErr } = await supabase.from("research_number_conflict").insert({
        job_id: jobId,
        vehicle_catalog_id: job.vehicle_catalog_id,
        platform_component_id: job.maintenance_component_id,
        position: positionKey,
        proposal_ids: conflictIds,
      });
      if (cErr && !String(cErr.message).includes("duplicate")) throw cErr;
    }

    for (const r of routed) {
      if (r.route !== "auto") continue;
      // An auto-add the save refuses (e.g. a part type with no catalogue area) stays for the owner to review.
      const { data: promoted, error: promoteErr } = await supabase.rpc("promote_part_proposal", { p_proposal_id: r.id, p_actor: null });
      if (promoteErr) {
        r.route = "review";
        await supabase.from("catalog_part_proposal").update({ route: "review" }).eq("id", r.id);
        await supabaseRpc(supabase, "catalog_research_log_event", {
          p_job_id: jobId,
          p_step: "promote",
          p_outcome: "auto_add_failed",
          p_detail: { proposalId: r.id, message: formatSupabaseError(promoteErr) },
        });
        continue;
      }
      const batchId = (promoted as { batchId?: string } | null)?.batchId;
      if (batchId) await autoResolveFromBatch(supabase, batchId, null);
    }

    const { count: openChecks } = await supabase.from("catalog_research_job")
      .select("id", { count: "exact", head: true }).eq("state", "browser_check");
    const nextState = decideJobOutcome({
      routed,
      hasBrowserCheckLink: Boolean(browserCheckUrl),
      browserCheckAllowed: job.browser_check_allowed !== false,
      openBrowserChecks: openChecks ?? 0,
      maxOpenBrowserChecks: Number(settings?.max_open_browser_checks ?? 25),
    });

    if (nextState === "not_found") {
      await finalizeCatalogJobNotFound(supabase, {
        jobId,
        groupKey: String(job.group_key),
        msgId,
        queue,
        eventOutcome: "no_proven_source",
        eventDetail: { proposals: routed.length, pageReads },
      });
      await supabaseUpdate(supabase, "catalog_research_settings", { last_run_ms: Date.now() - started, consecutive_failures: 0 }, (q) => q.eq("id", 1));
      return { ok: true, jobId, state: "not_found" };
    }
    if (nextState !== "auto_added") {
      await supabaseUpdate(supabase, "catalog_research_job", { state: nextState, step_done: 1, updated_at: new Date().toISOString() }, (q) => q.eq("id", jobId));
    }

    await supabaseRpc(supabase, "catalog_research_log_event", {
      p_job_id: jobId,
      p_step: "route",
      p_outcome: nextState,
      p_detail: { proposals: routed.length, auto: routed.filter((r) => r.route === "auto").length, pageReads, browserCheck: Boolean(browserCheckUrl) },
    });

    await supabaseRpc(supabase, "catalog_research_complete_msg", { p_msg_id: msgId, p_queue: queue });
    await supabaseUpdate(supabase, "catalog_research_settings", {
      last_run_ms: Date.now() - started,
      consecutive_failures: 0,
    }, (q) => q.eq("id", 1));

    return { ok: true, jobId, state: nextState };
  } catch (e) {
    const provider = classifyGeminiProviderError(e);
    if (provider) {
      return await handleGeminiProviderFault(supabase, { jobId, msgId, queue, provider });
    }
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseUpdate(supabase, "catalog_research_job", { last_error: msg, state: "queued" }, (q) => q.eq("id", jobId));
    await supabaseRpc(supabase, "catalog_research_log_event", {
      p_job_id: jobId,
      p_step: "worker",
      p_outcome: "error",
      p_detail: { message: msg },
    });

    const { data: settings } = await supabase.from("catalog_research_settings").select("*").eq("id", 1).single();
    const failures = (settings?.consecutive_failures || 0) + 1;
    const patch: Record<string, unknown> = { consecutive_failures: failures };
    if (failures >= 3) {
      const attempt = (settings?.auto_resume_attempt || 0) + 1;
      const minutes = attempt === 1 ? 15 : attempt === 2 ? 30 : 60;
      patch.paused = true;
      patch.paused_reason = msg;
      patch.auto_resume_attempt = attempt;
      if (attempt >= 4) {
        patch.auto_resume_at = null;
      } else {
        patch.auto_resume_at = new Date(Date.now() + minutes * 60_000).toISOString();
      }
      await supabaseRpc(supabase, "catalog_research_log_event", {
        p_job_id: jobId,
        p_step: "recovery",
        p_outcome: "paused",
        p_detail: { minutes, attempt },
      });
    }
    await supabaseUpdate(supabase, "catalog_research_settings", patch, (q) => q.eq("id", 1));
    throw e;
  }
}
