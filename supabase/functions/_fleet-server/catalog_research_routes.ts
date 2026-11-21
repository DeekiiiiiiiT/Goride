/**
 * Dominion catalog research admin routes (audit B3 + B4 API).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { dominionCan } from "../../../packages/auth-client/src/dominionPermissions.ts";
import { ENGINE_REV } from "./catalog_research_worker.ts";
import { autoResolveFromBatch } from "./catalog_request_autoresolve.ts";
import { versionListLink } from "./research_browser_check.ts";

// RE-23: explicit columns only — never select("*") on research tables.
const JOB_FIELDS = "id, job_type, state, vehicle_catalog_id, maintenance_component_id, fit_descriptor, match_type, spec_key, attempts, last_error, next_research_at, updated_at";
const PROPOSAL_FIELDS = "id, job_id, brand, part_number, part_number_norm, part_name, match_type, match_kind, position_key, fits, sources, checks, route, status, trust_route, evidence_read_ids, promoted_part_id, rejected_reason";
const VEHICLE_PROPOSAL_FIELDS = "id, job_id, make, model, production_start_year, production_end_year, chassis_code, engine_code, drivetrain, transmission, market, grade, chassis_serial_from, chassis_serial_to, existing_vehicle_catalog_id, action, status, rejected_reason, sources, checks, evidence_read_ids";
const CAR_FIELDS =
  "id, make, model, production_start_year, production_start_month, production_end_year, production_end_month, chassis_code, engine_code, engine_type, drivetrain, transmission, trim_series, catalog_trim";
const SPEC_PROPOSAL_FIELDS ="id, job_id, vehicle_catalog_id, spec_key, value, unit, evidence_read_ids, trust_route, route, status, rejected_reason";

async function bumpStreak(supabase: SupabaseClient, wouldAuto: boolean, outcome: "approved" | "rejected" | "edited") {
  await supabase.rpc("catalog_research_streak_bump", { p_would_auto: wouldAuto, p_outcome: outcome });
}

async function resolveBatch(supabase: SupabaseClient, result: unknown, actor: string | null) {
  const batchId = (result as { batchId?: string } | null)?.batchId;
  if (batchId) await autoResolveFromBatch(supabase, batchId, actor);
}

const PREFIX = "/make-server-37f42386/admin/catalog-research";

function jamaicaDayStartUtc(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Jamaica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}T05:00:00.000Z`;
}

function healthStatus(settings: { paused?: boolean }, health: Record<string, unknown> | null): "NOMINAL" | "DEGRADED" | "PAUSED" {
  if (settings?.paused) return "PAUSED";
  const warnings =
    Number(health?.stuckResearchingReset ?? 0) > 0
    || Number(health?.queuedOlderThan24h ?? 0) > 0
    || Number(health?.reviewOlderThan7d ?? 0) > 0;
  return warnings ? "DEGRADED" : "NOMINAL";
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** "vehicle:Toyota:Roomy:2019" / "model:Toyota:Roomy" → the car's make, model and year (never who asked). */
/**
 * RE-73: jobs closed on the owner's say-so are stored `failed` with a note ending "(owner)" ("replaced by front and
 * rear checks (owner)"). Returns that note without the tag, else null (a real failure).
 */
export function ownerClosedNote(state: string | null | undefined, lastError: string | null | undefined): string | null {
  if (state !== "failed") return null;
  const m = String(lastError ?? "").trim().match(/^(.+?)\s*\(owner\)$/i);
  return m ? m[1].trim() : null;
}

export function vehicleSubject(groupKey: string | null | undefined): { make: string; model: string; year: number | null } | null {
  const parts = String(groupKey ?? "").split(":");
  if (parts[0] !== "vehicle" && parts[0] !== "model") return null;
  const make = (parts[1] ?? "").trim();
  const model = (parts[2] ?? "").trim();
  if (!make && !model) return null;
  const year = Number(parts[3]);
  return { make, model, year: Number.isFinite(year) && year > 1900 ? year : null };
}

export function guardRead(c: Context) {
  const denied = assertPlatformStaffResponse(c);
  if (denied) return denied;
  // Reads: any Dominion staff (owner, support, analyst). There is no "catalog.read" action; writes check catalog.write.
  return null;
}

export function guardWrite(c: Context) {
  const read = guardRead(c);
  if (read) return read;
  const user = c.get("rbacUser") as { resolvedRole?: string } | undefined;
  if (!dominionCan(user?.resolvedRole, "catalog.write")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return null;
}

export function registerCatalogResearchRoutes(app: { get: Function; patch: Function; post: Function }, supabase: SupabaseClient) {
  app.get(`${PREFIX}/settings`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const { data: settings, error } = await supabase.from("catalog_research_settings").select("*").eq("id", 1).single();
    if (error) return c.json({ error: error.message }, 500);
    const health = await supabase.rpc("catalog_research_health");
    const healthObj = (health.data || {}) as Record<string, unknown>;
    return c.json({
      settings,
      engineRev: ENGINE_REV,
      latencyMs: settings?.last_run_ms ?? null,
      status: healthStatus(settings || {}, healthObj),
      health: healthObj,
    });
  });

  app.patch(`${PREFIX}/settings`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const body = await c.req.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.shadow_mode === "boolean") patch.shadow_mode = body.shadow_mode;
    if (typeof body.daily_job_limit === "number" && body.daily_job_limit >= 1 && body.daily_job_limit <= 500) {
      patch.daily_job_limit = Math.floor(body.daily_job_limit);
    }
    if (typeof body.daily_spend_usd === "number" && body.daily_spend_usd >= 0 && body.daily_spend_usd <= 500) {
      patch.daily_spend_usd = Math.round(body.daily_spend_usd * 100) / 100;
    }
    if (typeof body.max_open_browser_checks === "number" && body.max_open_browser_checks >= 0 && body.max_open_browser_checks <= 500) {
      patch.max_open_browser_checks = Math.floor(body.max_open_browser_checks);
    }
    if (typeof body.claim_share_fleet === "number" && body.claim_share_fleet >= 0 && body.claim_share_fleet <= 1) {
      patch.claim_share_fleet = body.claim_share_fleet;
    }
    if (typeof body.fill_target_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fill_target_date)) {
      patch.fill_target_date = body.fill_target_date;
    }
    if (typeof body.paused === "boolean") {
      patch.paused = body.paused;
      if (!body.paused) {
        patch.paused_reason = null;
        patch.auto_resume_at = null;
        patch.consecutive_failures = 0;
      }
    }
    const { data, error } = await supabase.from("catalog_research_settings").update(patch).eq("id", 1).select("*").single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ settings: data });
  });

  app.get(`${PREFIX}/jobs/:jobId`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const jobId = c.req.param("jobId");
    const [{ data: job, error: jErr }, { data: proposals }, { data: events }] = await Promise.all([
      supabase.from("catalog_research_job").select(JOB_FIELDS).eq("id", jobId).maybeSingle(),
      supabase.from("catalog_part_proposal").select(PROPOSAL_FIELDS).eq("job_id", jobId).order("created_at"),
      supabase.from("catalog_research_event").select("id, step, outcome, at").eq("job_id", jobId).order("at"),
    ]);
    if (jErr) return c.json({ error: jErr.message }, 500);
    if (!job) return c.json({ error: "Not found" }, 404);
    const [{ data: vehicleProposals }, { data: specProposals }, { data: conflicts }, { data: linkEvent }, { data: reads }] = await Promise.all([
      supabase.from("catalog_vehicle_proposal").select(VEHICLE_PROPOSAL_FIELDS).eq("job_id", jobId),
      supabase.from("catalog_spec_proposal").select(SPEC_PROPOSAL_FIELDS).eq("job_id", jobId),
      supabase.from("research_number_conflict").select("id, proposal_ids, position, opened_at, closed_at, resolution").eq("job_id", jobId),
      supabase.from("catalog_research_event").select("detail").eq("job_id", jobId).eq("step", "browser_check").eq("outcome", "link")
        .order("at", { ascending: false }).limit(1).maybeSingle(),
      // When each evidence page was read, and how (direct read or the owner's browser check). The text is in sources.
      supabase.from("research_page_read").select("id, domain, path, read_at").eq("job_id", jobId).eq("purpose", "job")
        .order("read_at", { ascending: false }).limit(50),
    ]);
    // Browser checks (S1 screen 3): the exact catalogue link — from a part proposal's checks or the spec job's event.
    const fromProposal = (proposals || [])
      .map((p) => ((p as { checks?: Record<string, unknown> }).checks?.browserCheckUrl))
      .find((u) => typeof u === "string" && u.startsWith("https://")) as string | undefined;
    const fromEvent = (linkEvent as { detail?: { url?: unknown } } | null)?.detail?.url;
    // RE-60: a link to one version of a frame is cut back to the frame's version list (Roam can't check the version).
    const browserCheckUrl = versionListLink(fromProposal ?? (typeof fromEvent === "string" && fromEvent.startsWith("https://") ? fromEvent : null));
    const vehicleId = (job as { vehicle_catalog_id?: string | null }).vehicle_catalog_id;
    const componentId = (job as { maintenance_component_id?: string | null }).maintenance_component_id;
    const specKey = (job as { spec_key?: string | null }).spec_key;
    const [{ data: car }, { data: comp }, { data: spec }] = await Promise.all([
      vehicleId
        ? supabase.from("vehicle_catalog").select(CAR_FIELDS).eq("id", vehicleId).maybeSingle()
        : Promise.resolve({ data: null }),
      componentId
        ? supabase.from("maintenance_service_categories").select("id, name, position_scheme").eq("id", componentId).maybeSingle()
        : Promise.resolve({ data: null }),
      specKey ? supabase.from("spec_key").select("key, label, unit").eq("key", specKey).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    // RE-62 / RE-63: the engine in plain words (only when Dominion knows it), the sister engines of the same years (so
    // the guide can say "not 1KRVET — that's the turbo"), and the catalogue version learned from an earlier check.
    let engineWords: string | null = null;
    let sisterEngines: Array<{ code: string; turbo: boolean }> = [];
    let knownVersion: {
      domain: string;
      code: string;
      url: string | null;
      engine: string | null;
      prodPeriod: string | null;
      grade: string | null;
      transmission: string | null;
    } | null = null;
    if (car) {
      const cr = car as {
        make: string;
        model: string;
        engine_code?: string | null;
        engine_type?: string | null;
        production_start_year?: number | null;
        production_end_year?: number | null;
      };
      const y1 = cr.production_start_year ?? 0;
      const y2 = cr.production_end_year ?? 9999;
      const [{ data: sisters }, { data: versions }] = await Promise.all([
        supabase.from("vehicle_catalog").select("engine_code, engine_type, production_start_year, production_end_year")
          .eq("make", cr.make).eq("model", cr.model).limit(60),
        supabase.from("research_car_site_version").select("domain, version_code, version_url, engine, prod_period, grade, transmission, confirmed_at")
          .eq("vehicle_catalog_id", vehicleId).order("confirmed_at", { ascending: false }),
      ]);
      type Sis = { engine_code: string | null; engine_type: string | null; production_start_year: number | null; production_end_year: number | null };
      const sameYears = ((sisters ?? []) as Sis[])
        .filter((x) => (x.production_start_year ?? 0) <= y2 && (x.production_end_year ?? 9999) >= y1);
      const norm = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const ownCode = norm(cr.engine_code);
      // A turbo sister counts even when its engine code isn't on file (for the "regular engine" words).
      const turboSisterAny = sameYears.some((x) => /turbo/i.test(String(x.engine_type ?? "")) && norm(x.engine_code) !== ownCode);
      const byCode = new Map<string, { code: string; turbo: boolean }>();
      for (const x of sameYears) {
        const code = String(x.engine_code ?? "").trim();
        const k = norm(code);
        if (!k || k === ownCode) continue;
        const prev = byCode.get(k);
        byCode.set(k, { code: prev?.code ?? code, turbo: (prev?.turbo ?? false) || /turbo/i.test(String(x.engine_type ?? "")) });
      }
      sisterEngines = [...byCode.values()];
      const own = String(cr.engine_type ?? "").trim().toLowerCase();
      if (/turbo/.test(own)) engineWords = "turbo engine";
      else if (/hybrid/.test(own)) engineWords = "hybrid engine";
      else if (/electric|\bev\b/.test(own)) engineWords = "electric";
      else if ((!own || /^(n\/?a|na|naturally aspirated)$/.test(own)) && turboSisterAny) {
        engineWords = "regular engine (not turbo)";
      }
      let linkDomain = "";
      try {
        linkDomain = browserCheckUrl ? new URL(browserCheckUrl).hostname.replace(/^www\./, "") : "";
      } catch {
        linkDomain = "";
      }
      // The version for the link's site, else the newest one confirmed for this car. The Open button keeps Roam's own
      // (list) link; the remembered version is offered separately so a wrong one can't lock the owner in.
      type Ver = {
        domain: string;
        version_code: string;
        version_url: string | null;
        engine: string | null;
        prod_period: string | null;
        grade: string | null;
        transmission: string | null;
      };
      const vs = (versions ?? []) as Ver[];
      const v = vs.find((x) => x.domain === linkDomain) ?? vs[0];
      if (v) {
        knownVersion = {
          domain: v.domain,
          code: v.version_code,
          url: v.version_url,
          engine: v.engine,
          prodPeriod: v.prod_period,
          grade: v.grade,
          transmission: v.transmission,
        };
      }
    }
    return c.json({
      job,
      car: car ? { ...(car as Record<string, unknown>), engine_words: engineWords } : null,
      sisterEngines,
      knownVersion,
      partType: comp ?? null,
      spec: spec ?? null,
      browserCheckUrl,
      reads: reads || [],
      proposals: proposals || [],
      vehicleProposals: vehicleProposals || [],
      specProposals: specProposals || [],
      conflicts: conflicts || [],
      events: events || [],
    });
  });

  app.get(`${PREFIX}/jobs`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const state = c.req.query("state");
    const types = (c.req.query("types") || "").split(",").map((t) => t.trim()).filter(Boolean);
    let q = supabase.from("catalog_research_job").select(`${JOB_FIELDS}, group_key`).order("updated_at", { ascending: false }).limit(500);
    if (state) q = q.eq("state", state);
    if (types.length) q = q.in("job_type", types);
    const { data: jobs, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    type JobListRow = { group_key?: string; id: string; job_type: string; state: string; vehicle_catalog_id: string | null; maintenance_component_id: string | null; spec_key: string | null; fit_descriptor: string | null; last_error?: string | null; updated_at: string };
    const rows = (jobs || []) as JobListRow[];
    const ids = rows.map((j) => j.id);
    const carIds = [...new Set(rows.map((j) => j.vehicle_catalog_id).filter(Boolean))] as string[];
    const compIds = [...new Set(rows.map((j) => j.maintenance_component_id).filter(Boolean))] as string[];
    const specKeys = [...new Set(rows.map((j) => j.spec_key).filter(Boolean))] as string[];
    const vehicleJobIds = rows.filter((j) => j.job_type !== "part" && j.job_type !== "spec").map((j) => j.id);
    const [{ data: props }, { data: specProps }, { data: cars }, { data: comps }, { data: specs }, { data: conflicts }, { data: vProps }] = await Promise.all([
      ids.length
        ? supabase.from("catalog_part_proposal").select("job_id, brand, part_number, sources, promoted_part_id, route, trust_route, status").in("job_id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from("catalog_spec_proposal").select("job_id, value, unit, trust_route, status").in("job_id", ids)
        : Promise.resolve({ data: [] }),
      carIds.length ? supabase.from("vehicle_catalog").select(CAR_FIELDS).in("id", carIds) : Promise.resolve({ data: [] }),
      compIds.length ? supabase.from("maintenance_service_categories").select("id, name").in("id", compIds) : Promise.resolve({ data: [] }),
      specKeys.length ? supabase.from("spec_key").select("key, label, unit").in("key", specKeys) : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from("research_number_conflict").select("job_id").in("job_id", ids).is("closed_at", null)
        : Promise.resolve({ data: [] }),
      vehicleJobIds.length
        ? supabase.from("catalog_vehicle_proposal").select("job_id, make, model, production_start_year, production_end_year, chassis_code, engine_code, drivetrain, grade, market, action, status").in("job_id", vehicleJobIds)
        : Promise.resolve({ data: [] }),
    ]);
    const vPropsByJob = new Map<string, Array<Record<string, unknown>>>();
    for (const p of vProps || []) {
      const k = String((p as { job_id: string }).job_id);
      vPropsByJob.set(k, [...(vPropsByJob.get(k) ?? []), p as Record<string, unknown>]);
    }
    type PropMeta = { result: string; sourceCount: number; trustRoute: string | null; domains: string[]; rank: number };
    const propByJob = new Map<string, PropMeta>();
    // The row shows the proposal that matters most: the one added, else the one open for review.
    const rankOf = (r: { promoted_part_id?: string | null; status?: string }) => (r.promoted_part_id ? 3 : r.status === "open" ? 2 : 1);
    for (const p of props || []) {
      const row = p as { job_id: string; brand?: string; part_number?: string; sources?: Array<Record<string, unknown>>; promoted_part_id?: string | null; trust_route?: string | null; status?: string };
      if (!row.part_number) continue;
      const rank = rankOf(row);
      const prev = propByJob.get(row.job_id);
      if (prev && prev.rank >= rank) continue;
      const kept = (Array.isArray(row.sources) ? row.sources : []).filter((s) => !s.dropped && typeof s.domain === "string");
      propByJob.set(row.job_id, {
        result: [row.brand, row.part_number].filter(Boolean).join(" "),
        sourceCount: kept.length,
        trustRoute: row.trust_route ?? null,
        domains: [...new Set(kept.map((s) => String(s.domain)))],
        rank,
      });
    }
    for (const p of specProps || []) {
      const row = p as { job_id: string; value?: string; unit?: string | null; trust_route?: string | null; status?: string };
      if (!row.value || propByJob.has(row.job_id)) continue;
      propByJob.set(row.job_id, {
        result: [row.value, row.unit].filter(Boolean).join(" "),
        sourceCount: 0,
        trustRoute: row.trust_route ?? null,
        domains: [],
        rank: 1,
      });
    }
    const carById = new Map((cars || []).map((v) => [(v as { id: string }).id, v]));
    const compById = new Map((comps || []).map((v) => [(v as { id: string }).id, (v as { name: string }).name]));
    const specByKey = new Map((specs || []).map((v) => [(v as { key: string }).key, v as { key: string; label: string; unit: string | null }]));
    const conflictJobs = new Set((conflicts || []).map((v) => (v as { job_id: string }).job_id));
    const items = rows.map((row) => {
      const meta = propByJob.get(row.id);
      return {
        jobId: row.id,
        jobType: row.job_type,
        state: row.state,
        vehicleCatalogId: row.vehicle_catalog_id,
        car: row.vehicle_catalog_id ? carById.get(row.vehicle_catalog_id) ?? null : null,
        partTypeId: row.maintenance_component_id,
        partTypeName: row.maintenance_component_id ? compById.get(row.maintenance_component_id) ?? null : null,
        specKey: row.spec_key,
        specLabel: row.spec_key ? specByKey.get(row.spec_key)?.label ?? null : null,
        fitDescriptor: row.fit_descriptor,
        resultPartNumber: meta?.result ?? "—",
        sourceCount: meta?.sourceCount ?? 0,
        trustRoute: meta?.trustRoute ?? null,
        siteDomains: meta?.domains ?? [],
        conflictOpen: conflictJobs.has(row.id),
        // RE-73: a job the owner had closed (e.g. "replaced by front and rear checks") shows as Closed with its note.
        closedNote: ownerClosedNote(row.state, row.last_error),
        // Vehicle jobs: the car being researched (make / model / year only) and what the engine proposed.
        subject: row.job_type === "vehicle" || row.job_type === "vehicle_model" ? vehicleSubject(row.group_key) : null,
        vehicleProposals: row.job_type === "part" || row.job_type === "spec" ? undefined : (vPropsByJob.get(row.id) ?? []).map((p) => {
          const { job_id: _j, ...rest } = p;
          return rest;
        }),
        updatedAt: row.updated_at,
      };
    });
    return c.json({ items });
  });

  app.post(`${PREFIX}/proposals/:proposalId/promote`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const user = c.get("rbacUser") as { id?: string } | undefined;
    const { data, error } = await supabase.rpc("promote_part_proposal", {
      p_proposal_id: c.req.param("proposalId"),
      p_actor: user?.id ?? null,
    });
    if (error) return c.json({ error: error.message }, 400);
    await resolveBatch(supabase, data, user?.id ?? null);
    return c.json({ result: data });
  });

  app.post(`${PREFIX}/jobs/:jobId/retry`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const jobId = c.req.param("jobId");
    await supabase.from("catalog_research_job").update({ state: "queued", last_error: null }).eq("id", jobId);
    await supabase.rpc("catalog_research_enqueue_job", { p_job_id: jobId });
    await supabase.rpc("catalog_research_log_event", {
      p_job_id: jobId,
      p_step: "retry",
      p_outcome: "queued",
      p_detail: {},
      p_actor: (c.get("rbacUser") as { id?: string })?.id ?? null,
    });
    return c.json({ ok: true });
  });

  app.post(`${PREFIX}/jobs/:jobId/research-next`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const jobId = c.req.param("jobId");
    await supabase.rpc("catalog_research_priority_enqueue", { p_job_id: jobId });
    await supabase.rpc("catalog_research_log_event", {
      p_job_id: jobId,
      p_step: "priority",
      p_outcome: "research_next",
      p_detail: {},
      p_actor: (c.get("rbacUser") as { id?: string })?.id ?? null,
    });
    return c.json({ ok: true });
  });

  app.get(`${PREFIX}/strip`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const since = jamaicaDayStartUtc();
    const [{ count: queued }, { count: review }, { count: failed }, { count: workingOn }, { count: todayResearch }] = await Promise.all([
      supabase.from("catalog_research_job").select("id", { count: "exact", head: true }).eq("state", "queued"),
      supabase.from("catalog_research_job").select("id", { count: "exact", head: true }).eq("state", "needs_review"),
      supabase.from("catalog_research_job").select("id", { count: "exact", head: true }).eq("state", "failed"),
      supabase.from("catalog_research_job").select("id", { count: "exact", head: true }).in("state", ["researching", "checking"]),
      supabase.from("catalog_research_event").select("id", { count: "exact", head: true }).eq("step", "research").gte("at", since),
    ]);
    const { data: settings } = await supabase.from("catalog_research_settings").select("*").eq("id", 1).single();
    const health = await supabase.rpc("catalog_research_health");
    const healthObj = (health.data || {}) as Record<string, unknown>;
    return c.json({
      queued: queued ?? 0,
      needsReview: review ?? 0,
      failed: failed ?? 0,
      workingOn: workingOn ?? 0,
      todayResearchCount: todayResearch ?? 0,
      enabled: settings?.enabled ?? false,
      paused: settings?.paused ?? false,
      pausedReason: settings?.paused_reason ?? null,
      autoResumeAt: settings?.auto_resume_at ?? null,
      dailyJobLimit: settings?.daily_job_limit ?? 40,
      status: healthStatus(settings || {}, healthObj),
      shadowStreak: settings?.shadow_approve_streak ?? 0,
      shadowMode: settings?.shadow_mode !== false,
    });
  });

  // RE-11: the one trusted list now lives in trusted_site + trusted_source (see /trusted-sites). This old read keeps the
  // Research settings page working until its screen moves; writes are owner-only on /trusted-sites.
  app.get(`${PREFIX}/trusted-sources`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const { data, error } = await supabase.from("trusted_site")
      .select("domain, automated_read, blocked_at, pages_confirmed").order("domain");
    if (error) return c.json({ error: error.message }, 500);
    const items = (data || []).map((row) => {
      const r = row as { domain: string; automated_read: string; blocked_at: string | null; pages_confirmed: number };
      return {
        domain: r.domain,
        kind: "catalogue",
        active: r.automated_read === "allowed",
        pages_confirmed: r.pages_confirmed,
        blocked: r.automated_read === "blocked",
        blocked_at: r.blocked_at,
        recentFetches: [],
      };
    });
    return c.json({ items });
  });

  app.post(`${PREFIX}/trusted-sources`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    return c.json({ error: "Trusted sites moved to Parts database → Trusted sources (owner only)." }, 410);
  });

  app.patch(`${PREFIX}/trusted-sources/:domain`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    return c.json({ error: "Trusted sites moved to Parts database → Trusted sources (owner only)." }, 410);
  });

  app.get(`${PREFIX}/export.csv`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const { data: jobs, error } = await supabase.from("catalog_research_job").select("id, job_type, state, vehicle_catalog_id, maintenance_component_id, spec_key, match_type, updated_at").order("updated_at", { ascending: false }).limit(5000);
    if (error) return c.json({ error: error.message }, 500);
    const lines = ["job_id,job_type,state,vehicle_catalog_id,part_type_id,spec_key,match_type,updated_at"];
    for (const j of jobs || []) {
      const row = j as Record<string, unknown>;
      lines.push([
        csvEscape(row.id),
        csvEscape(row.job_type),
        csvEscape(row.state),
        csvEscape(row.vehicle_catalog_id),
        csvEscape(row.maintenance_component_id),
        csvEscape(row.spec_key),
        csvEscape(row.match_type),
        csvEscape(row.updated_at),
      ].join(","));
    }
    const csv = lines.join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="catalog_research_jobs.csv"',
      },
    });
  });

  app.post(`${PREFIX}/reprocess-queued`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const actor = (c.get("rbacUser") as { id?: string } | undefined)?.id ?? null;
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count: recent } = await supabase.from("dominion_audit_log").select("id", { count: "exact", head: true })
      .eq("action", "reprocess_queued").eq("actor", actor).gte("at", since);
    if ((recent ?? 0) > 0) return c.json({ error: "Wait a minute before re-running again" }, 429);
    const { data: jobs, error } = await supabase.from("catalog_research_job").select("id").eq("state", "queued")
      .order("updated_at").limit(50);
    if (error) return c.json({ error: error.message }, 500);
    let count = 0;
    for (const j of jobs || []) {
      await supabase.rpc("catalog_research_enqueue_job", { p_job_id: (j as { id: string }).id });
      count += 1;
    }
    await supabase.from("dominion_audit_log").insert({ actor, action: "reprocess_queued", table_name: "catalog_research_job", row_id: null, after: { requeued: count } });
    return c.json({ requeued: count });
  });

  app.get(`${PREFIX}/incidents`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: jobs, error } = await supabase
      .from("catalog_research_job")
      .select("id, state, last_error, attempts, updated_at")
      .gte("updated_at", since)
      .in("state", ["failed", "queued"])
      .not("last_error", "is", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: jobs || [] });
  });

  app.post(`${PREFIX}/jobs/:jobId/undo`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const jobId = c.req.param("jobId");
    const user = c.get("rbacUser") as { id?: string } | undefined;
    const { data: job } = await supabase.from("catalog_research_job").select("*").eq("id", jobId).maybeSingle();
    if (!job) return c.json({ error: "Not found" }, 404);
    if (!["auto_added", "added"].includes(String(job.state))) {
      return c.json({ error: "Job is not in an added state" }, 400);
    }
    await supabase.from("catalog_research_job").update({ state: "needs_review", updated_at: new Date().toISOString() }).eq("id", jobId);
    await supabase.rpc("catalog_research_log_event", {
      p_job_id: jobId,
      p_step: "review",
      p_outcome: "undo",
      p_detail: {},
      p_actor: user?.id ?? null,
    });
    return c.json({ ok: true });
  });

  app.post(`${PREFIX}/jobs/:jobId/looks-right`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const jobId = c.req.param("jobId");
    const user = c.get("rbacUser") as { id?: string } | undefined;
    const body = await c.req.json() as { proposalId?: string };
    const proposalId = body.proposalId;
    if (!proposalId) return c.json({ error: "proposalId required" }, 400);
    const { data: prop } = await supabase.from("catalog_part_proposal").select("checks").eq("id", proposalId).maybeSingle();
    const { data, error } = await supabase.rpc("promote_part_proposal", {
      p_proposal_id: proposalId,
      p_actor: user?.id ?? null,
    });
    if (error) return c.json({ error: error.message }, 400);
    const checks = (prop?.checks || {}) as Record<string, unknown>;
    await resolveBatch(supabase, data, user?.id ?? null);
    await bumpStreak(supabase, checks.shadowWouldAuto === true, "approved");
    const { data: settings } = await supabase.from("catalog_research_settings").select("shadow_approve_streak, shadow_mode").eq("id", 1).single();
    if (settings?.shadow_mode && Number(settings.shadow_approve_streak) >= 20) {
      await supabase.from("catalog_research_settings").update({ shadow_mode: false }).eq("id", 1);
      await supabase.rpc("catalog_research_log_event", {
        p_job_id: jobId,
        p_step: "shadow",
        p_outcome: "graduated",
        p_detail: { streak: settings.shadow_approve_streak },
        p_actor: user?.id ?? null,
      });
    }
    return c.json({ result: data });
  });

  app.post(`${PREFIX}/jobs/:jobId/edit-and-add`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const jobId = c.req.param("jobId");
    const user = c.get("rbacUser") as { id?: string } | undefined;
    const body = await c.req.json() as {
      brand?: string;
      partNumber?: string;
      partName?: string;
      matchType?: string;
      sourceUrl?: string;
      sourceQuote?: string;
    };
    const sourceUrl = String(body.sourceUrl || "").trim();
    if (!sourceUrl) return c.json({ error: "sourceUrl required" }, 400);
    const { data: created, error: insErr } = await supabase.from("catalog_part_proposal").insert({
      job_id: jobId,
      brand: String(body.brand || "").slice(0, 80),
      part_number: String(body.partNumber || "").slice(0, 80),
      part_number_norm: String(body.partNumber || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
      part_name: String(body.partName || "Part").slice(0, 200),
      match_type: body.matchType ? String(body.matchType).slice(0, 40) : null,
      sources: [{ url: sourceUrl, quote: String(body.sourceQuote || "").slice(0, 500) }],
      checks: { manual: true },
      route: "review",
    }).select("id").single();
    if (insErr) return c.json({ error: insErr.message }, 400);
    const { data: wouldAuto } = await supabase.from("catalog_part_proposal").select("id").eq("job_id", jobId)
      .eq("status", "open").contains("checks", { shadowWouldAuto: true }).limit(1);
    await bumpStreak(supabase, (wouldAuto ?? []).length > 0, "edited");
    const { data, error } = await supabase.rpc("promote_part_proposal", {
      p_proposal_id: created.id,
      p_actor: user?.id ?? null,
    });
    if (error) return c.json({ error: error.message }, 400);
    await resolveBatch(supabase, data, user?.id ?? null);
    return c.json({ result: data, proposalId: created.id });
  });

  app.post(`${PREFIX}/jobs/:jobId/not-found`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const jobId = c.req.param("jobId");
    const user = c.get("rbacUser") as { id?: string } | undefined;
    const nextAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("catalog_research_job").update({
      state: "not_found",
      next_research_at: nextAt,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    await supabase.rpc("catalog_research_enqueue_job", { p_job_id: jobId });
    const { data: wouldAutoNf } = await supabase.from("catalog_part_proposal").select("id").eq("job_id", jobId)
      .eq("status", "open").contains("checks", { shadowWouldAuto: true }).limit(1);
    await bumpStreak(supabase, (wouldAutoNf ?? []).length > 0, "rejected");
    await supabase.rpc("catalog_research_log_event", {
      p_job_id: jobId,
      p_step: "review",
      p_outcome: "not_found",
      p_detail: { nextResearchAt: nextAt },
      p_actor: user?.id ?? null,
    });
    return c.json({ ok: true, nextResearchAt: nextAt });
  });

  app.patch(`${PREFIX}/jobs/:jobId`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const jobId = c.req.param("jobId");
    const body = await c.req.json() as { state?: string };
    if (body.state === "added") {
      return c.json({ error: "Use promote routes to mark added" }, 400);
    }
    if (!body.state) return c.json({ error: "state required" }, 400);
    const { error } = await supabase.from("catalog_research_job").update({ state: body.state, updated_at: new Date().toISOString() }).eq("id", jobId);
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ ok: true });
  });
}
