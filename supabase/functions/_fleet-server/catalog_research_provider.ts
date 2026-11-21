/**
 * Provider faults (docs/research-engine-audit.md RE-10 step 5 / RE-15): one classification for every cause that is
 * Google's or our own spend guard's, never the job's. A provider fault pauses the engine, puts the job back on the
 * queue untouched, and never counts toward the job's reads or the engine's failure streak.
 */

export type ProviderFaultCause =
  | "budget_daily"
  | "budget_monthly"
  | "killswitch"
  | "grounding_daily"
  | "credits"
  | "key_rejected"
  | "rate_limit"
  | "model_retired"
  | "server_error";

export type GeminiProviderError = {
  cause: ProviderFaultCause;
  httpStatus: number;
  pausedReason: string;
  /** null = stays paused until the owner presses Resume. */
  autoResumeMinutes: number | null;
  /** false = a scheduled pause (daily / monthly limit): it does not use up the engine's resume attempts. */
  countsAsRetry: boolean;
};

/** Minutes until the next 00:05 UTC (daily limits reset at midnight UTC; 5 minutes of slack). */
export function minutesUntilNextDailyReset(now: Date): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 5, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 60_000));
}

/** Minutes until 00:05 UTC on the 1st of next month. */
export function minutesUntilNextMonth(now: Date): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 5, 0));
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 60_000));
}

// Review #7: a limit needs both "search" wording and limit wording; "Search Grounding is not supported…" is a real error.
const GROUNDING_WORDS = /grounding|google[_ ]search|search/i;
const LIMIT_WORDS = /quota|limit|exceeded|per day|resource[_ ]exhausted/i;
const GROUNDING_LIMIT = { test: (body: string) => GROUNDING_WORDS.test(body) && LIMIT_WORDS.test(body) };
const MODEL_GONE = /not found|no longer available|is not supported|deprecated|retired|has been shut ?down/i;

export function classifyGeminiProviderError(err: unknown, now: Date = new Date()): GeminiProviderError | null {
  // Our own spend guard / kill switch (api_usage_logger ProviderBlockedError).
  const e = err as { name?: string; reason?: string; code?: string; message?: string } | null;
  const blockedReason = e && (e.reason || (typeof e.code === "string" && e.code.startsWith("PROVIDER_BLOCKED_")
    ? e.code.replace("PROVIDER_BLOCKED_", "").toLowerCase()
    : undefined));
  if (blockedReason === "budget_daily") {
    return {
      cause: "budget_daily",
      httpStatus: 503,
      pausedReason: "Daily spend limit reached",
      autoResumeMinutes: minutesUntilNextDailyReset(now),
      countsAsRetry: false,
    };
  }
  if (blockedReason === "budget_monthly") {
    return {
      cause: "budget_monthly",
      httpStatus: 503,
      pausedReason: "Monthly spend limit reached",
      autoResumeMinutes: minutesUntilNextMonth(now),
      countsAsRetry: false,
    };
  }
  if (blockedReason === "killswitch") {
    return { cause: "killswitch", httpStatus: 503, pausedReason: "Gemini switched off", autoResumeMinutes: null, countsAsRetry: false };
  }

  const msg = err instanceof Error ? err.message : String(err ?? "");
  const m = msg.match(/gemini_http_(\d{3})/i);
  if (!m) return null;
  const status = Number(m[1]);
  const body = msg.slice(m.index! + m[0].length);

  // Google's daily grounding limit — checked before the generic 429, whatever status Google uses for it.
  if ((status === 429 || status === 400 || status === 403) && GROUNDING_LIMIT.test(body)) {
    return {
      cause: "grounding_daily",
      httpStatus: status,
      pausedReason: "Google's daily search limit reached",
      autoResumeMinutes: minutesUntilNextDailyReset(now),
      countsAsRetry: false,
    };
  }
  if (status === 402) {
    return { cause: "credits", httpStatus: 402, pausedReason: "Gemini credits used up", autoResumeMinutes: null, countsAsRetry: true };
  }
  if (status === 401 || status === 403) {
    return { cause: "key_rejected", httpStatus: status, pausedReason: "Gemini key rejected", autoResumeMinutes: null, countsAsRetry: true };
  }
  if (status === 429) {
    return { cause: "rate_limit", httpStatus: 429, pausedReason: "Gemini rate limit", autoResumeMinutes: 15, countsAsRetry: true };
  }
  if (status === 404 && (MODEL_GONE.test(body) || body.trim() === "")) {
    const model = body.match(/models\/([a-z0-9.\-]+)/i)?.[1];
    return {
      cause: "model_retired",
      httpStatus: 404,
      pausedReason: model ? `Google no longer offers the model ${model}` : "Google no longer offers this model",
      autoResumeMinutes: null,
      countsAsRetry: true,
    };
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return { cause: "server_error", httpStatus: status, pausedReason: `Google error ${status}`, autoResumeMinutes: 15, countsAsRetry: true };
  }
  return null;
}
