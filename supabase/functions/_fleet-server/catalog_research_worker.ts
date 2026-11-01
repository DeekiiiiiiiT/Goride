/**
 * Catalog research worker tick (audit B3).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatSupabaseError } from "../_shared/formatSupabaseError.ts";
import { runCatalogPartResearch, runCatalogVehicleResearch } from "./catalog_research_gemini.ts";
import { normalizePartNumberNorm, checkPartNumberShape } from "./catalog_research_number_shape.ts";
import {
  domainFromUrl,
  fetchCatalogSourcePage,
  isTrustedDomain,
  verifySourcePage,
} from "./catalog_research_verify.ts";
import { classifyGeminiProviderError } from "./catalog_research_provider.ts";
import { routeProposals } from "./catalog_research_route.ts";

export const ENGINE_REV = "catalog-research-1";

async function loadTrustedDomains(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("catalog_trusted_source").select("domain").eq("active", true);
  if (error) throw error;
  return new Set((data || []).map((r) => String((r as { domain: string }).domain).toLowerCase()));
}

async function handleGeminiProviderFault(
  supabase: SupabaseClient,
  input: {
    jobId: string;
    msgId: number;
    queue: string;
    provider: ReturnType<typeof classifyGeminiProviderError>;
  },
): Promise<Record<string, unknown>> {
  const provider = input.provider!;
  await supabase.rpc("catalog_research_complete_msg", { p_msg_id: input.msgId, p_queue: input.queue });
  await supabase.rpc("catalog_research_enqueue_job", { p_job_id: input.jobId });
  await supabase.from("catalog_research_job").update({
    state: "queued",
    last_error: provider.pausedReason,
    pgmq_msg_id: null,
    pgmq_queue: null,
    pgmq_read_ct: null,
    updated_at: new Date().toISOString(),
  }).eq("id", input.jobId);

  const patch: Record<string, unknown> = {
    paused: true,
    paused_reason: provider.pausedReason,
    consecutive_failures: 0,
  };
  if (provider.autoResumeMinutes != null) {
    patch.auto_resume_at = new Date(Date.now() + provider.autoResumeMinutes * 60_000).toISOString();
    const { data: settings } = await supabase.from("catalog_research_settings").select("auto_resume_attempt").eq("id", 1).single();
    patch.auto_resume_attempt = (settings?.auto_resume_attempt || 0) + 1;
  } else {
    patch.auto_resume_at = null;
  }
  await supabase.from("catalog_research_settings").update(patch).eq("id", 1);
  await supabase.rpc("catalog_research_log_event", {
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

      await supabase.rpc("catalog_research_log_event", {
        p_job_id: jobId,
        p_step: "research",
        p_outcome: "ok",
        p_detail: { model: research.model },
      });

      const prop = research.proposal;
      await supabase.from("catalog_vehicle_proposal").insert({
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

      await supabase.from("catalog_research_job").update({ state: "needs_review", updated_at: new Date().toISOString() }).eq("id", jobId);
      await supabase.rpc("catalog_research_log_event", {
        p_job_id: jobId,
        p_step: "route",
        p_outcome: "needs_review",
        p_detail: { vehicle: true },
      });
      await supabase.rpc("catalog_research_complete_msg", { p_msg_id: msgId, p_queue: queue });
      await supabase.from("catalog_research_settings").update({ last_run_ms: Date.now() - started, consecutive_failures: 0 }).eq("id", 1);
      return { ok: true, jobId, vehicleReview: true };
    }

    const { data: vc } = await supabase.from("vehicle_catalog").select("*").eq("id", job.vehicle_catalog_id).maybeSingle();
    const { data: comp } = await supabase.from("maintenance_service_categories").select("name").eq("id", job.maintenance_component_id).maybeSingle();
    const { data: notes } = await supabase.from("parts_sourcing_requests").select("need_text, looking_note, old_part_number").eq("catalog_research_job_id", jobId).limit(20);

    const noteLines = (notes || []).map((n) => [n.need_text, n.looking_note, n.old_part_number].filter(Boolean).join(" · ")).join("\n");

    await supabase.from("catalog_research_job").update({ state: "researching" }).eq("id", jobId);

    const research = await runCatalogPartResearch({
      promptContext: [
        `Car: ${vc?.make || ""} ${vc?.model || ""} years ${vc?.production_start_year || ""}-${vc?.production_end_year || ""}`,
        `Chassis: ${vc?.chassis_code || ""} Engine: ${vc?.engine_code || ""} Drivetrain: ${vc?.drivetrain || ""}`,
        `Part type: ${comp?.name || ""}`,
        `Axle/side fit: ${job.fit_descriptor || ""}`,
        `Match type: ${job.match_type || ""}`,
        `Fleet notes:\n${noteLines}`,
      ].join("\n"),
    });

    await supabase.rpc("catalog_research_log_event", {
      p_job_id: jobId,
      p_step: "research",
      p_outcome: "ok",
      p_detail: { model: research.model, count: research.candidates.length },
    });

    await supabase.from("catalog_research_job").update({ state: "checking" }).eq("id", jobId);

    const trusted = await loadTrustedDomains(supabase);
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
      const partNumberNorm = normalizePartNumberNorm(cand.partNumber);
      const shape = checkPartNumberShape(cand.brand, cand.partNumber);
      const verifiedSources: Array<Record<string, unknown>> = [];
      const passedDomains: string[] = [];

      for (const src of (cand.sources || []).slice(0, 3)) {
        if (pageFetches >= 6) break;
        pageFetches += 1;
        const fetched = await fetchCatalogSourcePage(src.url);
        const domain = domainFromUrl(fetched.finalUrl);
        const sourceBase: Record<string, unknown> = {
          url: fetched.finalUrl,
          domain,
        };
        if (fetched.redirectUrl) sourceBase.redirect_url = fetched.redirectUrl;
        if (!isTrustedDomain(domain, trusted)) {
          verifiedSources.push({ ...sourceBase, dropped: true, reason: "untrusted" });
          continue;
        }
        const check = verifySourcePage({
          html: fetched.html,
          partNumber: cand.partNumber,
          chassisCode: vc?.chassis_code,
          model: vc?.model,
          engineCode: vc?.engine_code,
          needsAxle: Boolean(job.fit_descriptor?.includes("front") || job.fit_descriptor?.includes("rear")),
          axle: job.fit_descriptor?.includes("rear") ? "rear" : job.fit_descriptor?.includes("front") ? "front" : null,
        });
        verifiedSources.push({
          ...sourceBase,
          quote: src.quote,
          fetched_ok: fetched.html.length > 0,
          number_found: check.numberFound,
          car_found: check.carFound,
          position_found: check.positionFound,
        });
        if (check.passed) passedDomains.push(domain);
      }

      const matchType = String(cand.matchType || job.match_type || "");
      const propId = crypto.randomUUID();
      proposalRows.push({
        id: propId,
        job_id: jobId,
        brand: cand.brand,
        part_number: cand.partNumber,
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
      const { error: insErr } = await supabase.from("catalog_part_proposal").insert(proposalRows);
      if (insErr) throw insErr;
    }

    for (const r of routes) {
      if (r.route === "auto") {
        await supabase.rpc("promote_part_proposal", { p_proposal_id: r.id, p_actor: null });
      }
    }

    const anyAuto = routes.some((r) => r.route === "auto");
    let nextState = "needs_review";
    if (anyAuto) {
      const { data: refreshed } = await supabase.from("catalog_research_job").select("state").eq("id", jobId).single();
      nextState = refreshed?.state || "auto_added";
    } else {
      await supabase.from("catalog_research_job").update({ state: nextState, updated_at: new Date().toISOString() }).eq("id", jobId);
    }

    await supabase.rpc("catalog_research_log_event", {
      p_job_id: jobId,
      p_step: "route",
      p_outcome: nextState,
      p_detail: { proposals: routes.length, anyAuto },
    });

    await supabase.rpc("catalog_research_complete_msg", { p_msg_id: msgId, p_queue: queue });
    await supabase.from("catalog_research_settings").update({
      last_run_ms: Date.now() - started,
      consecutive_failures: 0,
    }).eq("id", 1);

    return { ok: true, jobId, state: nextState };
  } catch (e) {
    const provider = classifyGeminiProviderError(e);
    if (provider) {
      return await handleGeminiProviderFault(supabase, { jobId, msgId, queue, provider });
    }
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("catalog_research_job").update({ last_error: msg, state: "queued" }).eq("id", jobId);
    await supabase.rpc("catalog_research_log_event", {
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
      await supabase.rpc("catalog_research_log_event", {
        p_job_id: jobId,
        p_step: "recovery",
        p_outcome: "paused",
        p_detail: { minutes, attempt },
      });
    }
    await supabase.from("catalog_research_settings").update(patch).eq("id", 1);
    throw e;
  }
}
