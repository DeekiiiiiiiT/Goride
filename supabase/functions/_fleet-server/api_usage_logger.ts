/**
 * api_usage_logger.ts
 *
 * Single entry point every outbound provider call goes through. Handles:
 *   - Pre-flight guards (kill-switch + monthly / daily budget cap).
 *   - Writing a detailed call row + atomic aggregate updates.
 *   - Cost estimation via `api_pricing.ts`.
 *
 * KV key layout (guards only — call rows live in private.api_usage_*):
 *   api_killswitch:{provider}                     — { disabled, reason, by, at }
 *   api_budget:{provider}                         — { monthlyBudgetUSD, dailyBudgetUSD, hardStop }
 */

import * as kv from "./kv_store.tsx";
import { getServiceClient } from "./service_client.ts";
import { estimateCostUSD, type Provider, type UsageInput } from "./api_pricing.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderCallEntry {
  provider: Provider;
  service?: string;
  route?: string;
  model?: string;
  userId?: string;
  orgId?: string | null;
  status: "success" | "error";
  httpStatus?: number;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  requests?: number;
  requestId?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  /** Allow callers to override estimated cost (rarely used). */
  costUSDOverride?: number;
}

export interface ProviderAggregate {
  provider: Provider;
  period: string;
  calls: number;
  errors: number;
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
  images: number;
  requests: number;
  lastUpdated: string;
}

export interface BudgetConfig {
  provider: Provider;
  monthlyBudgetUSD: number;
  dailyBudgetUSD: number;
  /** When true, guards throw once the cap is exceeded. When false, we only flag. */
  hardStop: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface KillswitchConfig {
  provider: Provider;
  disabled: boolean;
  reason?: string;
  by?: string;
  at?: string;
}

export class ProviderBlockedError extends Error {
  public provider: Provider;
  public reason: "killswitch" | "budget_monthly" | "budget_daily";
  public code: string;
  public httpStatus: number;
  constructor(provider: Provider, reason: ProviderBlockedError["reason"], message: string) {
    super(message);
    this.provider = provider;
    this.reason = reason;
    this.code = `PROVIDER_BLOCKED_${reason.toUpperCase()}`;
    this.httpStatus = 503;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayYMD(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
function thisMonthYM(d: Date = new Date()): string {
  return d.toISOString().slice(0, 7);
}

function killswitchKey(provider: Provider): string {
  return `api_killswitch:${provider}`;
}
function budgetKey(provider: Provider): string {
  return `api_budget:${provider}`;
}

// ---------------------------------------------------------------------------
// Pre-flight guards
// ---------------------------------------------------------------------------

export async function getKillswitch(provider: Provider): Promise<KillswitchConfig> {
  const raw = await kv.get(killswitchKey(provider));
  if (!raw) return { provider, disabled: false };
  return { provider, ...raw };
}

export async function getBudget(provider: Provider): Promise<BudgetConfig | null> {
  const raw = await kv.get(budgetKey(provider));
  if (!raw) return null;
  return { provider, ...raw };
}

export async function checkProviderGuards(provider: Provider): Promise<void> {
  const [ks, budget] = await Promise.all([
    getKillswitch(provider),
    getBudget(provider),
  ]);

  if (ks.disabled) {
    throw new ProviderBlockedError(
      provider,
      "killswitch",
      `Provider "${provider}" is disabled by kill-switch${ks.reason ? `: ${ks.reason}` : ""}.`
    );
  }

  if (budget && budget.hardStop) {
    const month = thisMonthYM();
    const day = todayYMD();
    const totals = await readUsageTotals(provider, [month, day]);
    const monthAgg = totals.get(month) ?? null;
    const dayAgg = totals.get(day) ?? null;

    if (budget.monthlyBudgetUSD > 0 && monthAgg && monthAgg.costUSD >= budget.monthlyBudgetUSD) {
      throw new ProviderBlockedError(
        provider,
        "budget_monthly",
        `Monthly budget of $${budget.monthlyBudgetUSD.toFixed(2)} exceeded for ${provider}.`
      );
    }
    if (budget.dailyBudgetUSD > 0 && dayAgg && dayAgg.costUSD >= budget.dailyBudgetUSD) {
      throw new ProviderBlockedError(
        provider,
        "budget_daily",
        `Daily budget of $${budget.dailyBudgetUSD.toFixed(2)} exceeded for ${provider}.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rowToAggregate(
  row: Record<string, unknown>,
  provider: Provider,
  period: string,
): ProviderAggregate {
  return {
    provider,
    period,
    calls: num(row.calls),
    errors: num(row.errors),
    costUSD: num(row.cost_usd ?? row.costUSD),
    inputTokens: num(row.input_tokens ?? row.inputTokens),
    outputTokens: num(row.output_tokens ?? row.outputTokens),
    images: num(row.images),
    requests: num(row.requests),
    lastUpdated: String(row.updated_at || new Date().toISOString()),
  };
}

/** Day and month totals. One read, updated in the database so two calls cannot lose a count. */
export async function readUsageTotals(
  provider: Provider,
  periods: string[],
): Promise<Map<string, ProviderAggregate>> {
  const map = new Map<string, ProviderAggregate>();
  if (periods.length === 0) return map;
  const { data, error } = await getServiceClient().rpc("api_usage_totals", {
    p_provider: provider,
    p_periods: periods,
  });
  if (error) throw new Error(error.message);
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const period = String(row.period || "");
    if (!period) continue;
    map.set(period, rowToAggregate(row, provider, period));
  }
  return map;
}

export async function readTopRoutes(provider: string, day: string) {
  const { data, error } = await getServiceClient().rpc("api_usage_top_routes", {
    p_provider: provider,
    p_day: day,
  });
  if (error) throw new Error(error.message);
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    route: String(row.route || "(unknown)"),
    calls: num(row.calls),
    costUSD: num(row.cost_usd ?? row.costUSD),
  }));
}

export async function readUsageEvents(opts: {
  provider?: string;
  status?: string;
  q?: string;
  fromDay: string;
  toDay: string;
  limit: number;
}) {
  const { data, error } = await getServiceClient().rpc("api_usage_events_between", {
    p_provider: opts.provider || null,
    p_status: opts.status || null,
    p_q: opts.q || null,
    p_from: opts.fromDay,
    p_to: opts.toDay,
    p_limit: opts.limit,
  });
  if (error) throw new Error(error.message);
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    provider: row.provider,
    service: row.service,
    route: row.route,
    model: row.model,
    status: row.status,
    httpStatus: row.http_status,
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    images: row.images,
    requests: row.requests,
    costUSD: num(row.cost_usd),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    userId: row.user_id,
    orgId: row.org_id,
    timestamp: row.occurred_at,
  }));
}

export async function logProviderCall(entry: ProviderCallEntry): Promise<void> {
  try {
    const now = new Date();
    const usage: UsageInput = {
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      images: entry.images,
      requests: entry.requests,
    };
    const costUSD =
      typeof entry.costUSDOverride === "number"
        ? entry.costUSDOverride
        : estimateCostUSD(entry.provider, entry.model, entry.service, usage);

    const { error } = await getServiceClient().rpc("log_api_usage", {
      p_provider: entry.provider,
      p_service: entry.service ?? null,
      p_route: entry.route ?? null,
      p_model: entry.model ?? null,
      p_status: entry.status,
      p_http_status: entry.httpStatus ?? null,
      p_latency_ms: entry.latencyMs ?? null,
      p_input_tokens: entry.inputTokens ?? null,
      p_output_tokens: entry.outputTokens ?? null,
      p_images: entry.images ?? null,
      p_requests: entry.requests ?? null,
      p_cost_usd: costUSD,
      p_error_code: entry.errorCode ?? null,
      p_error_message: entry.errorMessage ?? null,
      p_user_id: entry.userId ?? null,
      p_org_id: entry.orgId ?? null,
      p_occurred_at: now.toISOString(),
    });
    if (error) throw new Error(error.message);
  } catch (e: any) {
    // Never break the primary call because of a logging failure.
    console.warn(`[ApiUsageLogger] Failed to log provider call: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Convenience wrapper — lets a call site wrap its provider invocation in one
// line. Handles timing, logging, and guard enforcement.
// ---------------------------------------------------------------------------

export interface TrackedCallOptions<T> {
  provider: Provider;
  service?: string;
  route?: string;
  model?: string;
  userId?: string;
  orgId?: string | null;
  /** Pre-declared request count (maps/geocoding). Token usage is extracted from the response via `extractUsage`. */
  requests?: number;
  images?: number;
  run: () => Promise<T>;
  /** Optional mapper from the provider response to token / image counts. */
  extractUsage?: (result: T) => UsageInput & { requestId?: string };
}

export async function trackedProviderCall<T>(opts: TrackedCallOptions<T>): Promise<T> {
  const t0 = Date.now();
  await checkProviderGuards(opts.provider);
  try {
    const result = await opts.run();
    const usage = opts.extractUsage ? opts.extractUsage(result) : {};
    await logProviderCall({
      provider: opts.provider,
      service: opts.service,
      route: opts.route,
      model: opts.model,
      userId: opts.userId,
      orgId: opts.orgId,
      status: "success",
      httpStatus: 200,
      latencyMs: Date.now() - t0,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      images: usage.images ?? opts.images,
      requests: usage.requests ?? opts.requests,
      requestId: usage.requestId,
    });
    return result;
  } catch (err: any) {
    if (err instanceof ProviderBlockedError) {
      await logProviderCall({
        provider: opts.provider,
        service: opts.service,
        route: opts.route,
        model: opts.model,
        userId: opts.userId,
        orgId: opts.orgId,
        status: "error",
        httpStatus: 503,
        latencyMs: Date.now() - t0,
        errorCode: err.code,
        errorMessage: err.message,
      });
      throw err;
    }
    await logProviderCall({
      provider: opts.provider,
      service: opts.service,
      route: opts.route,
      model: opts.model,
      userId: opts.userId,
      orgId: opts.orgId,
      status: "error",
      httpStatus: err?.status || err?.httpStatus || 500,
      latencyMs: Date.now() - t0,
      errorCode: err?.code || err?.name,
      errorMessage: err?.message,
      requests: opts.requests,
      images: opts.images,
    });
    throw err;
  }
}
