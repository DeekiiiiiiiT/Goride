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
import { finalizeCatalogJobNotFound } from "./catalog_research_not_found.ts";
import {
  geminiHttpErrorDetail,
  runPartGeminiResearchWithRetry,
} from "./catalog_research_part_research.ts";
import {
  checkPartNumberShape,
  normalizeResearchCandidate,
} from "./catalog_research_number_shape.ts";
import {
  catalogSourceFetchMeta,
  domainFromUrl,
  fetchCatalogSourcePage,
  isTrustedDomain,
  type CatalogSourceFetch,
  verifySourcePage,
} from "./catalog_research_verify.ts";
import { classifyGeminiProviderError } from "./catalog_research_provider.ts";
import { routeProposals } from "./catalog_research_route.ts";

export const ENGINE_REV = "catalog-research-5";

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

async function loadTrustedDomains(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("catalog_trusted_source").select("domain").eq("active", true);
  if (error) throw error;
  return new Set((data || []).map((r) => String((r as { domain: string }).domain).toLowerCase()));
}

async function loadKnownManufacturers(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("part_master").select("manufacturer").not("manufacturer", "is", null).limit(800);
  if (error) throw error;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of data || []) {
    const m = String((row as { manufacturer: string }).manufacturer || "").trim();
    if (!m) continue;
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

async function recordTrustedSourceFetch(
  supabase: SupabaseClient,
  input: {
    domain: string;
    jobId: string;
    requestedUrl: string;
    fetched: CatalogSourceFetch;
    reason: string | null;
  },
): Promise<void> {
  const domain = input.domain.toLowerCase();
  await supabaseInsert(supabase, "catalog_trusted_source_fetch", {
    domain,
    job_id: input.jobId,
    requested_url: input.requestedUrl,
    final_url: input.fetched.finalUrl,
    http_status: input.fetched.httpStatus,
    byte_count: input.fetched.byteCount,
    reason: input.reason,
  });
  await supabaseRpc(supabase, "catalog_trusted_source_fetch_trim", { p_domain: domain, p_keep: 50 });
}

async function bumpPagesConfirmed(supabase: SupabaseClient, domain: string): Promise<void> {
  const { data, error } = await supabase.from("catalog_trusted_source").select("pages_confirmed").eq("domain", domain).maybeSingle();
  if (error || !data) return;
  const next = Number((data as { pages_confirmed?: number }).pages_confirmed || 0) + 1;
  await supabaseUpdate(supabase, "catalog_trusted_source", { pages_confirmed: next }, (q) => q.eq("domain", domain));
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
    const { data: settings, error: settingsErr } = await supabase.from("catalog_research_settings").select("auto_resume_attempt").eq("id", 1).single();
    throwOnSupabaseError("select catalog_research_settings", { error: settingsErr });
    patch.auto_resume_attempt = (settings?.auto_resume_attempt || 0) + 1;
  } else {
    patch.auto_resume_at = null;
  }
  await supabaseUpdate(supabase, "catalog_research_settings", patch, (q) => q.eq("id", 1));
  await supabaseRpc(supabase, "catalog_research_log_event", {
    p_job_id: input.jobId,
    p_step: "recovery",
    p_outcome: "paused_provider",
    p_detail: { httpStatus: provider.httpStatus, reason: provider.pausedReason },
  });
  return { ok: true, paused: true, reason: provider.pausedReason, jobId: input.jobId };
}

export async function runCatalogResearchWorker(supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const started = Date.now();
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
      const { data: pending } = await supabase
        .from("vehicle_catalog_pending_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const research = await runCatalogVehicleResearch({
        promptContext: [
          `Proposed vehicle: ${pending?.proposed_make || ""} ${pending?.proposed_model || ""}`,
          `Years: ${pending?.proposed_production_start_year || ""}-${pending?.proposed_production_end_year || ""}`,
          `Drivetrain: ${pending?.proposed_drivetrain || ""} Transmission: ${pending?.proposed_transmission || ""}`,
          `Fuel: ${pending?.proposed_fuel_type || ""}`,
        ].join("\n"),
      });

      await supabaseRpc(supabase, "catalog_research_log_event", {
        p_job_id: jobId,
        p_step: "research",
        p_outcome: "ok",
        p_detail: { model: research.model },
      });

      const prop = research.proposal;
      await supabaseInsert(supabase, "catalog_vehicle_proposal", {
        job_id: jobId,
        make: prop.make ?? pending?.proposed_make,
        model: prop.model ?? pending?.proposed_model,
        production_start_year: prop.productionStartYear ?? pending?.proposed_production_start_year,
        production_end_year: prop.productionEndYear ?? pending?.proposed_production_end_year,
        chassis_code: prop.chassisCode,
        engine_code: prop.engineCode,
        drivetrain: prop.drivetrain ?? pending?.proposed_drivetrain,
        transmission: prop.transmission ?? pending?.proposed_transmission,
        market: prop.market ?? job.market ?? "JM",
        sources: prop.sources ?? [],
        checks: { model: research.model },
      });

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

    const { data: vc } = await supabase.from("vehicle_catalog").select("*").eq("id", job.vehicle_catalog_id).maybeSingle();
    const { data: comp } = await supabase.from("maintenance_service_categories").select("name").eq("id", job.maintenance_component_id).maybeSingle();
    const { data: notes } = await supabase.from("parts_sourcing_requests").select("need_text, looking_note, old_part_number").eq("catalog_research_job_id", jobId).limit(20);

    const noteLines = (notes || []).map((n) => [n.need_text, n.looking_note, n.old_part_number].filter(Boolean).join(" · ")).join("\n");

    await supabaseUpdate(supabase, "catalog_research_job", { state: "researching" }, (q) => q.eq("id", jobId));

    const trusted = await loadTrustedDomains(supabase);
    const trustedDomains = [...trusted];
    const promptContext = [
      `Car: ${vc?.make || ""} ${vc?.model || ""} years ${vc?.production_start_year || ""}-${vc?.production_end_year || ""}`,
      `Chassis: ${vc?.chassis_code || ""} Engine: ${vc?.engine_code || ""} Drivetrain: ${vc?.drivetrain || ""}`,
      `Part type: ${comp?.name || ""}`,
      `Axle/side fit: ${job.fit_descriptor || ""}`,
      `Match type: ${job.match_type || ""}`,
      `Fleet notes:\n${noteLines}`,
    ].join("\n");
    const searchQuery = [
      vc?.make,
      vc?.model,
      vc?.chassis_code,
      vc?.engine_code,
      comp?.name,
      "part number",
    ].filter(Boolean).join(" ");

    const geminiInput = { promptContext, searchQuery, trustedDomains };

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
      p_detail: {
        model: research.model,
        count: research.candidates.length,
        groundingChunks,
        sourceUrls,
        attempts,
      },
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
    const proposalRows: Array<Record<string, unknown>> = [];
    const routeInput: Array<{
      id: string;
      slotKey: string;
      matchType: string;
      partNumberNorm: string;
      passedDomains: string[];
      shape: ReturnType<typeof checkPartNumberShape>;
    }> = [];

    let pageFetches = 0;
    for (const cand of research.candidates.slice(0, 5)) {
      if (!(cand.sources?.length ?? 0)) continue;
      const normalized = normalizeResearchCandidate(cand.brand, cand.partNumber, knownManufacturers);
      const partNumberNorm = normalized.partNumberNorm;
      const shape = checkPartNumberShape(normalized.brand, normalized.partNumber);
      const verifiedSources: Array<Record<string, unknown>> = [];
      const passedDomains: string[] = [];

      for (const src of (cand.sources || []).slice(0, 3)) {
        if (pageFetches >= 6) break;
        pageFetches += 1;
        const requestedUrl = String(src.url || "");
        const groundingTitle = String((src as { grounding_title?: string }).grounding_title || "");
        const fetched = await fetchCatalogSourcePage(requestedUrl);
        let domain = domainFromUrl(fetched.finalUrl);
        if (
          (!domain || domain === "vertexaisearch.cloud.google.com")
          && groundingTitle
        ) {
          const fromTitle = domainFromGroundingTitle(groundingTitle);
          if (fromTitle) domain = fromTitle;
        }
        const fetchMeta = catalogSourceFetchMeta(fetched);
        const sourceBase: Record<string, unknown> = {
          url: requestedUrl,
          ...fetchMeta,
          domain,
        };
        if (groundingTitle) sourceBase.grounding_title = groundingTitle;
        if (fetched.redirectUrl) sourceBase.redirect_url = fetched.redirectUrl;

        if (fetched.redirectFailed) {
          verifiedSources.push({ ...sourceBase, dropped: true, reason: "redirect_failed" });
          continue;
        }

        if (isTrustedDomain(domain, trusted)) {
          await recordTrustedSourceFetch(supabase, {
            domain,
            jobId,
            requestedUrl,
            fetched,
            reason: null,
          });
        }

        if (!isTrustedDomain(domain, trusted)) {
          verifiedSources.push({ ...sourceBase, dropped: true, reason: "untrusted" });
          continue;
        }

        const check = verifySourcePage({
          html: fetched.html,
          partNumber: normalized.partNumber,
          chassisCode: vc?.chassis_code,
          model: vc?.model,
          engineCode: vc?.engine_code,
          needsAxle: Boolean(job.fit_descriptor?.includes("front") || job.fit_descriptor?.includes("rear")),
          axle: job.fit_descriptor?.includes("rear") ? "rear" : job.fit_descriptor?.includes("front") ? "front" : null,
        });
        verifiedSources.push({
          ...sourceBase,
          quote: src.quote,
          fetched_ok: fetched.byteCount > 0 && fetched.httpStatus >= 200 && fetched.httpStatus < 400,
          number_found: check.numberFound,
          car_found: check.carFound,
          position_found: check.positionFound,
        });
        if (check.passed) {
          passedDomains.push(domain);
          await bumpPagesConfirmed(supabase, domain);
        }
      }

      const matchType = String(cand.matchType || job.match_type || "");
      const propId = crypto.randomUUID();
      proposalRows.push({
        id: propId,
        job_id: jobId,
        brand: normalized.brand,
        part_number: normalized.partNumber,
        part_number_norm: partNumberNorm,
        part_name: cand.partName,
        match_type: matchType,
        fits: cand.fits || {},
        sources: verifiedSources,
        checks: { shape, passedDomains: [...new Set(passedDomains)] },
        route: "review",
      });
      routeInput.push({
        id: propId,
        slotKey: `${matchType.toLowerCase()}`,
        matchType,
        partNumberNorm,
        passedDomains,
        shape,
      });
    }

    const { data: settings } = await supabase.from("catalog_research_settings").select("shadow_mode").eq("id", 1).single();
    const routes = routeProposals({ proposals: routeInput, shadowMode: settings?.shadow_mode !== false });
    const routeById = new Map(routes.map((r) => [r.id, r]));
    for (const row of proposalRows) {
      const routed = routeById.get(String(row.id));
      if (routed) {
        row.checks = {
          ...(row.checks as Record<string, unknown>),
          shadowWouldAuto: routed.shadowWouldAuto,
          passedDomainCount: routed.passedDomainCount,
        };
        row.route = routed.route;
      }
    }

    if (proposalRows.length) {
      await supabaseInsert(supabase, "catalog_part_proposal", proposalRows);
    }

    for (const r of routes) {
      if (r.route === "auto") {
        await supabaseRpc(supabase, "promote_part_proposal", { p_proposal_id: r.id, p_actor: null });
      }
    }

    const anyAuto = routes.some((r) => r.route === "auto");
    let nextState = "needs_review";
    if (anyAuto) {
      const { data: refreshed } = await supabase.from("catalog_research_job").select("state").eq("id", jobId).single();
      nextState = refreshed?.state || "auto_added";
    } else {
      await supabaseUpdate(supabase, "catalog_research_job", { state: nextState, updated_at: new Date().toISOString() }, (q) => q.eq("id", jobId));
    }

    await supabaseRpc(supabase, "catalog_research_log_event", {
      p_job_id: jobId,
      p_step: "route",
      p_outcome: nextState,
      p_detail: { proposals: routes.length, anyAuto },
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
