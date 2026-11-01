/**
 * Dominion catalog research admin routes (audit B3 + B4 API).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { dominionCan } from "../../../packages/auth-client/src/dominionPermissions.ts";
import { ENGINE_REV } from "./catalog_research_worker.ts";

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

function guardRead(c: Context) {
  const denied = assertPlatformStaffResponse(c);
  if (denied) return denied;
  const user = c.get("rbacUser") as { resolvedRole?: string; role?: string } | undefined;
  if (!dominionCan(user?.resolvedRole || user?.role, "catalog.read")) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return null;
}

function guardWrite(c: Context) {
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
      supabase.from("catalog_research_job").select("*").eq("id", jobId).maybeSingle(),
      supabase.from("catalog_part_proposal").select("*").eq("job_id", jobId).order("created_at"),
      supabase.from("catalog_research_event").select("*").eq("job_id", jobId).order("at"),
    ]);
    if (jErr) return c.json({ error: jErr.message }, 500);
    if (!job) return c.json({ error: "Not found" }, 404);
    const { data: vehicleProposals } = await supabase.from("catalog_vehicle_proposal").select("*").eq("job_id", jobId);
    return c.json({ job, proposals: proposals || [], vehicleProposals: vehicleProposals || [], events: events || [] });
  });

  app.get(`${PREFIX}/jobs`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const state = c.req.query("state");
    let q = supabase.from("catalog_research_job").select("*").order("updated_at", { ascending: false }).limit(200);
    if (state) q = q.eq("state", state);
    const { data: jobs, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    const ids = (jobs || []).map((j) => (j as { id: string }).id);
    const { data: props } = ids.length
      ? await supabase.from("catalog_part_proposal").select("job_id, part_number, sources, promoted_part_id, route").in("job_id", ids)
      : { data: [] };
    const propByJob = new Map<string, { partNumber: string; sourceCount: number }>();
    for (const p of props || []) {
      const row = p as { job_id: string; part_number?: string; sources?: unknown[]; promoted_part_id?: string | null };
      if (row.promoted_part_id || row.part_number) {
        propByJob.set(row.job_id, {
          partNumber: row.part_number || "—",
          sourceCount: Array.isArray(row.sources) ? row.sources.length : 0,
        });
      }
    }
    const items = (jobs || []).map((j) => {
      const row = j as { id: string; state: string; group_key: string; fleet_count: number; updated_at: string };
      const meta = propByJob.get(row.id);
      return {
        jobId: row.id,
        state: row.state,
        groupKey: row.group_key,
        fleetCount: row.fleet_count,
        resultPartNumber: meta?.partNumber ?? (row.state === "queued" ? "—" : "—"),
        sourceCount: meta?.sourceCount ?? 0,
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

  app.get(`${PREFIX}/trusted-sources`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const { data, error } = await supabase.from("catalog_trusted_source").select("*").order("domain");
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ items: data || [] });
  });

  app.post(`${PREFIX}/trusted-sources`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const body = await c.req.json() as { domain?: string; kind?: string };
    const domain = String(body.domain || "").trim().toLowerCase().replace(/^www\./, "");
    if (!domain) return c.json({ error: "domain required" }, 400);
    const kind = body.kind === "aftermarket_catalog" ? "aftermarket_catalog" : "oem_catalog";
    const { error } = await supabase.from("catalog_trusted_source").upsert({ domain, kind, active: true });
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ ok: true });
  });

  app.patch(`${PREFIX}/trusted-sources/:domain`, async (c: Context) => {
    const denied = guardWrite(c);
    if (denied) return denied;
    const domain = decodeURIComponent(c.req.param("domain"));
    const body = await c.req.json() as { active?: boolean };
    if (typeof body.active !== "boolean") return c.json({ error: "active required" }, 400);
    const { error } = await supabase.from("catalog_trusted_source").update({ active: body.active }).eq("domain", domain);
    if (error) return c.json({ error: error.message }, 400);
    return c.json({ ok: true });
  });

  app.get(`${PREFIX}/export.csv`, async (c: Context) => {
    const denied = guardRead(c);
    if (denied) return denied;
    const { data: jobs, error } = await supabase.from("catalog_research_job").select("id, job_type, state, group_key, fleet_count, match_type, updated_at").order("updated_at", { ascending: false }).limit(5000);
    if (error) return c.json({ error: error.message }, 500);
    const lines = ["job_id,job_type,state,group_key,fleet_count,match_type,updated_at"];
    for (const j of jobs || []) {
      const row = j as Record<string, unknown>;
      lines.push([
        csvEscape(row.id),
        csvEscape(row.job_type),
        csvEscape(row.state),
        csvEscape(row.group_key),
        csvEscape(row.fleet_count),
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
    const { data: jobs, error } = await supabase.from("catalog_research_job").select("id").eq("state", "queued");
    if (error) return c.json({ error: error.message }, 500);
    let count = 0;
    for (const j of jobs || []) {
      await supabase.rpc("catalog_research_enqueue_job", { p_job_id: (j as { id: string }).id });
      count += 1;
    }
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
    if (checks.shadowWouldAuto === true) {
      const { data: settings } = await supabase.from("catalog_research_settings").select("shadow_approve_streak, shadow_mode").eq("id", 1).single();
      const streak = (settings?.shadow_approve_streak || 0) + 1;
      const patch: Record<string, unknown> = { shadow_approve_streak: streak };
      if (streak >= 20 && settings?.shadow_mode) {
        patch.shadow_mode = false;
        await supabase.rpc("catalog_research_log_event", {
          p_job_id: jobId,
          p_step: "shadow",
          p_outcome: "graduated",
          p_detail: { streak },
          p_actor: user?.id ?? null,
        });
      }
      await supabase.from("catalog_research_settings").update(patch).eq("id", 1);
    } else {
      await supabase.from("catalog_research_settings").update({ shadow_approve_streak: 0 }).eq("id", 1);
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
    await supabase.from("catalog_research_settings").update({ shadow_approve_streak: 0 }).eq("id", 1);
    const { data, error } = await supabase.rpc("promote_part_proposal", {
      p_proposal_id: created.id,
      p_actor: user?.id ?? null,
    });
    if (error) return c.json({ error: error.message }, 400);
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
    await supabase.from("catalog_research_settings").update({ shadow_approve_streak: 0 }).eq("id", 1);
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
