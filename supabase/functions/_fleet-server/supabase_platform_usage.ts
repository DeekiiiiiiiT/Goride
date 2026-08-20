/**
 * supabase_platform_usage.ts
 *
 * Pulls Supabase org/project usage meters (same class as dashboard Usage Summary),
 * caches snapshots in KV, and builds a leak-radar from analytics logs.
 *
 * Auth: SUPABASE_PAT (server-side only) + SUPABASE_PROJECT_REF / SUPABASE_ORG_SLUG.
 */

import * as kv from "./kv_store.tsx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanTier = "free" | "pro" | "team" | "enterprise";

export type MeterKey =
  | "egressGb"
  | "cachedEgressGb"
  | "storageSizeGb"
  | "databaseSizeGb"
  | "functionInvocations"
  | "monthlyActiveUsers"
  | "monthlyActiveSsoUsers"
  | "monthlyActiveThirdPartyUsers"
  | "realtimePeakConnections"
  | "realtimeMessages"
  | "storageImageTransformations"
  | "logDrainEvents"
  | "microComputeHours";

export type MeterUnit = "gb" | "count" | "hours";

export interface PlanQuotas {
  tier: PlanTier;
  included: Partial<Record<MeterKey, number>>;
  updatedAt?: string;
}

export interface UsageMeter {
  key: MeterKey;
  label: string;
  unit: MeterUnit;
  used: number | null;
  included: number | null;
  pct: number | null;
  projected: number | null;
  status: "ok" | "warn" | "critical" | "unavailable";
  available: boolean;
}

export interface UsageSnapshot {
  syncedAt: string;
  periodStart: string;
  periodEnd: string;
  projectRef: string;
  orgSlug: string;
  source: "org_usage" | "composed";
  raw: Record<string, number | null>;
  meters: UsageMeter[];
  alertStatus: "ok" | "warn" | "critical";
  alertMessages: string[];
}

export interface AlertConfig {
  warnPct: number;
  criticalPct: number;
  invocationSpikeMult: number;
  updatedAt?: string;
  updatedBy?: string;
}

export type RadarClass = "tiny" | "heavy" | "normal";

export interface RadarPathRow {
  path: string;
  requests: number;
  classification: RadarClass;
  spike: boolean;
  priorRequests: number;
}

export interface RadarResult {
  range: "24h" | "7d";
  generatedAt: string;
  rest: RadarPathRow[];
  functions: RadarPathRow[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Constants / KV keys
// ---------------------------------------------------------------------------

const KV_LATEST = "api_supabase_usage:latest";
const KV_PLAN = "api_supabase_plan";
const KV_ALERTS = "api_supabase_alerts";
const KV_LAST_SYNC = "api_supabase_usage:last_sync_at";
const KV_DAY_PREFIX = "api_supabase_usage:";

const BYTES_PER_GB = 1024 ** 3;
const SYNC_MIN_INTERVAL_MS = 60_000;

const DEFAULT_ALERTS: AlertConfig = {
  warnPct: 50,
  criticalPct: 80,
  invocationSpikeMult: 5,
};

/** Pro quotas (included units). Free kept for reference if plan is switched. */
export const PLAN_QUOTAS: Record<PlanTier, Partial<Record<MeterKey, number>>> = {
  free: {
    egressGb: 5,
    cachedEgressGb: 5,
    storageSizeGb: 1,
    databaseSizeGb: 0.5,
    functionInvocations: 500_000,
    monthlyActiveUsers: 50_000,
    realtimePeakConnections: 200,
    realtimeMessages: 2_000_000,
    storageImageTransformations: 0,
    logDrainEvents: 0,
    microComputeHours: 750, // ~shared free compute approximation
  },
  pro: {
    egressGb: 250,
    cachedEgressGb: 250,
    storageSizeGb: 100,
    databaseSizeGb: 8,
    functionInvocations: 2_000_000,
    monthlyActiveUsers: 100_000,
    realtimePeakConnections: 500,
    realtimeMessages: 5_000_000,
    storageImageTransformations: 100,
    logDrainEvents: 0,
    microComputeHours: 750, // Micro instance hours in billing cycle (~31d * 24)
  },
  team: {
    egressGb: 250,
    cachedEgressGb: 250,
    storageSizeGb: 100,
    databaseSizeGb: 8,
    functionInvocations: 2_000_000,
    monthlyActiveUsers: 100_000,
    realtimePeakConnections: 500,
    realtimeMessages: 5_000_000,
    storageImageTransformations: 100,
    logDrainEvents: 0,
    microComputeHours: 750,
  },
  enterprise: {
    // Empty = treat meters as uncapped in UI
  },
};

const METER_META: Record<MeterKey, { label: string; unit: MeterUnit; metric: string }> = {
  egressGb: { label: "Egress", unit: "gb", metric: "EGRESS" },
  cachedEgressGb: { label: "Cached Egress", unit: "gb", metric: "CACHED_EGRESS" },
  storageSizeGb: { label: "Storage Size", unit: "gb", metric: "STORAGE_SIZE" },
  databaseSizeGb: { label: "Database Size", unit: "gb", metric: "DATABASE_SIZE" },
  functionInvocations: { label: "Edge Function Invocations", unit: "count", metric: "FUNCTION_INVOCATIONS" },
  monthlyActiveUsers: { label: "Monthly Active Users", unit: "count", metric: "MONTHLY_ACTIVE_USERS" },
  monthlyActiveSsoUsers: { label: "Monthly Active SSO Users", unit: "count", metric: "MONTHLY_ACTIVE_SSO_USERS" },
  monthlyActiveThirdPartyUsers: {
    label: "Monthly Active Third-Party Users",
    unit: "count",
    metric: "MONTHLY_ACTIVE_THIRD_PARTY_USERS",
  },
  realtimePeakConnections: {
    label: "Realtime Concurrent Peak Connections",
    unit: "count",
    metric: "REALTIME_PEAK_CONNECTIONS",
  },
  realtimeMessages: { label: "Realtime Messages", unit: "count", metric: "REALTIME_MESSAGE_COUNT" },
  storageImageTransformations: {
    label: "Storage Image Transformations",
    unit: "count",
    metric: "STORAGE_IMAGES_TRANSFORMED",
  },
  logDrainEvents: { label: "Log Drain Events", unit: "count", metric: "LOG_DRAIN_EVENTS" },
  microComputeHours: { label: "Micro Compute Hours", unit: "hours", metric: "COMPUTE_HOURS_XS" },
};

const BYTE_METRICS = new Set(["EGRESS", "CACHED_EGRESS", "STORAGE_SIZE", "DATABASE_SIZE"]);

const TINY_PATH_RE =
  /(\/auth\/v1\/user|\/auth\/v1\/token|\/health|\/notifications|kv_store_|\/realtime\/)/i;
const HEAVY_PATH_RE =
  /(fuel-entries|fleet_fuel|fleet_transactions|\/transactions|limit=10000|storage\/v1\/object)/i;

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

export function getProjectRef(): string {
  return (
    Deno.env.get("SUPABASE_PROJECT_REF") ||
    (Deno.env.get("SUPABASE_URL") || "").replace(/^https?:\/\//, "").split(".")[0] ||
    ""
  );
}

export function getPat(): string {
  return (Deno.env.get("SUPABASE_PAT") || "").trim();
}

async function resolveOrgSlug(pat: string): Promise<string> {
  const fromEnv = (Deno.env.get("SUPABASE_ORG_SLUG") || "").trim();
  if (fromEnv) return fromEnv;

  const cached: PlanQuotas & { orgSlug?: string } | null = await kv.get(KV_PLAN);
  if (cached?.orgSlug) return String(cached.orgSlug);

  const res = await fetch("https://api.supabase.com/v1/organizations", {
    headers: { Authorization: `Bearer ${pat}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to list organizations (${res.status})`);
  }
  const orgs = await res.json();
  const list = Array.isArray(orgs) ? orgs : [];
  const projectRef = getProjectRef();
  // Prefer org that owns our project when Management API returns projects nested;
  // otherwise first org.
  let slug = list[0]?.id || list[0]?.slug || "";
  for (const o of list) {
    if (o?.id || o?.slug) {
      slug = o.id || o.slug;
      break;
    }
  }
  // Soft fallback used in this workspace
  if (!slug) slug = "tllnqjkyfrlvvdgovaui";
  void projectRef;
  return String(slug);
}

function billingPeriodBounds(now = new Date()): { start: string; end: string; daysElapsed: number; daysInCycle: number } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
  const daysInCycle = end.getUTCDate();
  const daysElapsed = Math.max(1, now.getUTCDate());
  return {
    start: start.toISOString(),
    end: now.toISOString(),
    daysElapsed,
    daysInCycle,
  };
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Plan + alerts
// ---------------------------------------------------------------------------

export async function getPlanConfig(): Promise<PlanQuotas & { orgSlug?: string }> {
  const stored: (PlanQuotas & { orgSlug?: string }) | null = await kv.get(KV_PLAN);
  const tier: PlanTier = stored?.tier || "pro";
  return {
    tier,
    included: { ...PLAN_QUOTAS[tier], ...(stored?.included || {}) },
    updatedAt: stored?.updatedAt,
    orgSlug: stored?.orgSlug,
  };
}

export async function seedPlanIfNeeded(orgSlug?: string): Promise<PlanQuotas & { orgSlug?: string }> {
  const existing = await kv.get(KV_PLAN);
  if (existing?.tier) {
    if (orgSlug && !existing.orgSlug) {
      const next = { ...existing, orgSlug };
      await kv.set(KV_PLAN, next);
      return next;
    }
    return existing;
  }
  const seeded: PlanQuotas & { orgSlug?: string } = {
    tier: "pro",
    included: { ...PLAN_QUOTAS.pro },
    updatedAt: new Date().toISOString(),
    orgSlug,
  };
  await kv.set(KV_PLAN, seeded);
  return seeded;
}

export async function getAlertConfig(): Promise<AlertConfig> {
  const stored: AlertConfig | null = await kv.get(KV_ALERTS);
  return { ...DEFAULT_ALERTS, ...(stored || {}) };
}

export async function saveAlertConfig(
  patch: Partial<AlertConfig>,
  by?: string,
): Promise<AlertConfig> {
  const current = await getAlertConfig();
  const next: AlertConfig = {
    warnPct: Number(patch.warnPct ?? current.warnPct),
    criticalPct: Number(patch.criticalPct ?? current.criticalPct),
    invocationSpikeMult: Number(patch.invocationSpikeMult ?? current.invocationSpikeMult),
    updatedAt: new Date().toISOString(),
    updatedBy: by || current.updatedBy,
  };
  if (!(next.warnPct > 0 && next.warnPct < next.criticalPct && next.criticalPct <= 100)) {
    throw new Error("Invalid thresholds: need 0 < warnPct < criticalPct <= 100");
  }
  if (!(next.invocationSpikeMult >= 1)) {
    throw new Error("invocationSpikeMult must be >= 1");
  }
  await kv.set(KV_ALERTS, next);
  return next;
}

// ---------------------------------------------------------------------------
// Meter building
// ---------------------------------------------------------------------------

function toDisplayValue(metric: string, usage: number, usageOriginal: number): number {
  if (BYTE_METRICS.has(metric)) {
    const bytes = Number.isFinite(usageOriginal) && usageOriginal > 0 ? usageOriginal : usage;
    // If value looks like bytes, convert; if already small (< 10_000) treat as GB
    if (bytes >= 10_000) return bytes / BYTES_PER_GB;
    return bytes;
  }
  return Number.isFinite(usageOriginal) ? usageOriginal : usage;
}

function buildMeters(
  rawByMetric: Record<string, { usage: number; usage_original: number; available?: boolean }>,
  plan: PlanQuotas,
  alerts: AlertConfig,
  daysElapsed: number,
  daysInCycle: number,
): { meters: UsageMeter[]; raw: Record<string, number | null>; alertStatus: "ok" | "warn" | "critical"; alertMessages: string[] } {
  const raw: Record<string, number | null> = {};
  const meters: UsageMeter[] = [];
  const messages: string[] = [];
  let alertStatus: "ok" | "warn" | "critical" = "ok";

  for (const key of Object.keys(METER_META) as MeterKey[]) {
    const meta = METER_META[key];
    const row = rawByMetric[meta.metric];
    const included = plan.included[key] ?? null;
    let used: number | null = null;
    let available = true;

    if (!row) {
      used = null;
      available = false;
    } else {
      used = toDisplayValue(meta.metric, row.usage, row.usage_original);
      if (row.available === false) available = false;
    }
    raw[key] = used;

    const pct = used != null && included != null && included > 0 ? (used / included) * 100 : null;
    const projected =
      used != null && daysElapsed > 0 ? (used / daysElapsed) * daysInCycle : null;

    let status: UsageMeter["status"] = available ? "ok" : "unavailable";
    if (available && pct != null) {
      if (pct >= alerts.criticalPct || (projected != null && included != null && projected > included)) {
        status = "critical";
      } else if (pct >= alerts.warnPct) {
        status = "warn";
      }
    }

    if (status === "critical") {
      alertStatus = "critical";
      messages.push(`${meta.label} at ${pct?.toFixed(0) ?? "?"} of included`);
    } else if (status === "warn" && alertStatus !== "critical") {
      alertStatus = "warn";
      messages.push(`${meta.label} crossed ${alerts.warnPct}%`);
    }

    meters.push({
      key,
      label: meta.label,
      unit: meta.unit,
      used,
      included,
      pct,
      projected,
      status,
      available,
    });
  }

  return { meters, raw, alertStatus, alertMessages: messages };
}

// ---------------------------------------------------------------------------
// Sync from platform usage API
// ---------------------------------------------------------------------------

interface OrgUsageRow {
  metric: string;
  usage: number;
  usage_original: number;
  available_in_plan?: boolean;
  pricing_free_units?: number;
}

export async function syncUsageSnapshot(opts?: { force?: boolean }): Promise<{
  ok: boolean;
  reason?: string;
  snapshot?: UsageSnapshot;
  detail?: string;
}> {
  const pat = getPat();
  const projectRef = getProjectRef();
  if (!pat || !projectRef) {
    return {
      ok: false,
      reason: "not-configured",
      detail: "Set SUPABASE_PAT and SUPABASE_PROJECT_REF (or SUPABASE_URL) as function secrets.",
    };
  }

  const lastSync: string | null = await kv.get(KV_LAST_SYNC);
  if (!opts?.force && lastSync) {
    const elapsed = Date.now() - new Date(lastSync).getTime();
    if (elapsed < SYNC_MIN_INTERVAL_MS) {
      const latest: UsageSnapshot | null = await kv.get(KV_LATEST);
      return {
        ok: true,
        reason: "rate-limited",
        snapshot: latest || undefined,
        detail: `Synced ${Math.ceil((SYNC_MIN_INTERVAL_MS - elapsed) / 1000)}s ago — wait before next pull.`,
      };
    }
  }

  let orgSlug: string;
  try {
    orgSlug = await resolveOrgSlug(pat);
  } catch (e: any) {
    return { ok: false, reason: "org-resolve-failed", detail: e?.message || String(e) };
  }

  await seedPlanIfNeeded(orgSlug);
  const plan = await getPlanConfig();
  const alerts = await getAlertConfig();
  const period = billingPeriodBounds();

  const qs = new URLSearchParams({
    project_ref: projectRef,
    start: period.start,
    end: period.end,
  });
  const url = `https://api.supabase.com/platform/organizations/${encodeURIComponent(orgSlug)}/usage?${qs}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      ok: false,
      reason: "upstream-error",
      detail: `Org usage API ${res.status}: ${body.slice(0, 500)}`,
    };
  }

  const payload = await res.json();
  const usages: OrgUsageRow[] = Array.isArray(payload?.usages) ? payload.usages : [];
  const rawByMetric: Record<string, { usage: number; usage_original: number; available?: boolean }> = {};
  const includedFromApi: Partial<Record<MeterKey, number>> = {};

  for (const u of usages) {
    if (!u?.metric) continue;
    rawByMetric[u.metric] = {
      usage: Number(u.usage) || 0,
      usage_original: Number(u.usage_original) || Number(u.usage) || 0,
      available: u.available_in_plan !== false,
    };
    // Map free units onto our meter keys when Supabase reports them
    for (const key of Object.keys(METER_META) as MeterKey[]) {
      if (METER_META[key].metric !== u.metric) continue;
      if (u.pricing_free_units != null && Number(u.pricing_free_units) > 0) {
        const free = Number(u.pricing_free_units);
        includedFromApi[key] = BYTE_METRICS.has(u.metric)
          ? free >= 10_000
            ? free / BYTES_PER_GB
            : free
          : free;
      }
    }
  }

  const planMerged: PlanQuotas = {
    ...plan,
    included: { ...plan.included, ...includedFromApi },
  };

  const { meters, raw, alertStatus, alertMessages } = buildMeters(
    rawByMetric,
    planMerged,
    alerts,
    period.daysElapsed,
    period.daysInCycle,
  );

  const snapshot: UsageSnapshot = {
    syncedAt: new Date().toISOString(),
    periodStart: period.start,
    periodEnd: period.end,
    projectRef,
    orgSlug,
    source: "org_usage",
    raw,
    meters,
    alertStatus,
    alertMessages,
  };

  await kv.set(KV_LATEST, snapshot);
  await kv.set(`${KV_DAY_PREFIX}${dayKey()}`, {
    syncedAt: snapshot.syncedAt,
    raw: snapshot.raw,
    alertStatus: snapshot.alertStatus,
  });
  await kv.set(KV_LAST_SYNC, snapshot.syncedAt);
  await kv.set(KV_PLAN, {
    ...planMerged,
    orgSlug,
    updatedAt: plan.updatedAt || snapshot.syncedAt,
  });

  return { ok: true, snapshot };
}

export async function getLatestSummary(): Promise<{
  snapshot: UsageSnapshot | null;
  plan: PlanQuotas & { orgSlug?: string };
  alerts: AlertConfig;
  configured: boolean;
}> {
  const plan = await seedPlanIfNeeded();
  const alerts = await getAlertConfig();
  const snapshot: UsageSnapshot | null = await kv.get(KV_LATEST);
  const configured = !!(getPat() && getProjectRef());

  if (snapshot?.raw) {
    const period = billingPeriodBounds();
    // Snapshot.raw already stores display units (GB / counts / hours)
    const rawByMetric: Record<string, { usage: number; usage_original: number }> = {};
    for (const key of Object.keys(METER_META) as MeterKey[]) {
      const v = snapshot.raw[key];
      if (v == null || !Number.isFinite(v)) continue;
      rawByMetric[METER_META[key].metric] = { usage: v, usage_original: v };
    }
    const rebuilt = buildMeters(rawByMetric, plan, alerts, period.daysElapsed, period.daysInCycle);
    snapshot.meters = rebuilt.meters;
    snapshot.alertStatus = rebuilt.alertStatus;
    snapshot.alertMessages = rebuilt.alertMessages;
  }

  return { snapshot, plan, alerts, configured };
}

// ---------------------------------------------------------------------------
// Leak radar
// ---------------------------------------------------------------------------

function classifyPath(path: string): RadarClass {
  if (HEAVY_PATH_RE.test(path)) return "heavy";
  if (TINY_PATH_RE.test(path)) return "tiny";
  return "normal";
}

async function queryAnalyticsLogs(
  pat: string,
  projectRef: string,
  sql: string,
  startIso: string,
  endIso: string,
): Promise<any[]> {
  const qs = new URLSearchParams({
    sql,
    iso_timestamp_start: startIso,
    iso_timestamp_end: endIso,
  });
  // Prefer Management API v1 analytics endpoint
  const urls = [
    `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all?${qs}`,
    `https://api.supabase.com/platform/projects/${projectRef}/analytics/endpoints/logs.all?${qs}`,
  ];
  let lastErr = "";
  for (const url of urls) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" },
    });
    if (!res.ok) {
      lastErr = `${res.status} ${await res.text()}`.slice(0, 300);
      continue;
    }
    const body = await res.json();
    if (Array.isArray(body?.result)) return body.result;
    if (Array.isArray(body)) return body;
    return [];
  }
  throw new Error(`Analytics logs query failed: ${lastErr}`);
}

function withSpike(
  current: { path: string; requests: number }[],
  prior: Map<string, number>,
  spikeMult: number,
): RadarPathRow[] {
  return current.map((r) => {
    const priorRequests = prior.get(r.path) || 0;
    const spike = priorRequests > 0 && r.requests >= priorRequests * spikeMult;
    return {
      path: r.path,
      requests: r.requests,
      classification: classifyPath(r.path),
      spike,
      priorRequests,
    };
  });
}

export async function buildRadar(range: "24h" | "7d"): Promise<RadarResult> {
  const pat = getPat();
  const projectRef = getProjectRef();
  const notes: string[] = [];
  if (!pat || !projectRef) {
    return {
      range,
      generatedAt: new Date().toISOString(),
      rest: [],
      functions: [],
      notes: ["SUPABASE_PAT / project ref not configured — radar unavailable."],
    };
  }

  const alerts = await getAlertConfig();
  const hours = range === "7d" ? 24 * 7 : 24;
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  const priorEnd = start;
  const priorStart = new Date(priorEnd.getTime() - hours * 3600_000);

  const restSql = `
    select log_attributes['request.path'] as path, count() as requests
    from logs
    where source = 'edge_logs'
    group by path
    order by requests desc
    limit 20
  `.trim();

  const fnSql = `
    select log_attributes['request.pathname'] as path, count() as requests
    from logs
    where source = 'function_edge_logs'
    group by path
    order by requests desc
    limit 20
  `.trim();

  let restCurrent: { path: string; requests: number }[] = [];
  let fnCurrent: { path: string; requests: number }[] = [];
  const restPrior = new Map<string, number>();
  const fnPrior = new Map<string, number>();

  try {
    const [restNow, fnNow, restBefore, fnBefore] = await Promise.all([
      queryAnalyticsLogs(pat, projectRef, restSql, start.toISOString(), end.toISOString()),
      queryAnalyticsLogs(pat, projectRef, fnSql, start.toISOString(), end.toISOString()),
      queryAnalyticsLogs(pat, projectRef, restSql, priorStart.toISOString(), priorEnd.toISOString()).catch(() => []),
      queryAnalyticsLogs(pat, projectRef, fnSql, priorStart.toISOString(), priorEnd.toISOString()).catch(() => []),
    ]);

    restCurrent = (restNow || [])
      .filter((r) => r?.path)
      .map((r) => ({ path: String(r.path), requests: Number(r.requests) || 0 }));
    fnCurrent = (fnNow || [])
      .filter((r) => r?.path)
      .map((r) => ({ path: String(r.path), requests: Number(r.requests) || 0 }));

    for (const r of restBefore || []) {
      if (r?.path) restPrior.set(String(r.path), Number(r.requests) || 0);
    }
    for (const r of fnBefore || []) {
      if (r?.path) fnPrior.set(String(r.path), Number(r.requests) || 0);
    }
  } catch (e: any) {
    notes.push(e?.message || String(e));
  }

  if (restCurrent.some((r) => /limit=10000/i.test(r.path))) {
    notes.push("limit=10000 query pattern detected — unbounded list dumps may have returned.");
  }
  if (
    [...restCurrent, ...fnCurrent].some(
      (r) => /fuel-entries|fleet_fuel|\/transactions/i.test(r.path) && r.requests > 500,
    )
  ) {
    notes.push("Elevated fuel/transaction traffic — confirm date-bounded reads are still live.");
  }

  return {
    range,
    generatedAt: new Date().toISOString(),
    rest: withSpike(restCurrent, restPrior, alerts.invocationSpikeMult),
    functions: withSpike(fnCurrent, fnPrior, alerts.invocationSpikeMult),
    notes,
  };
}
