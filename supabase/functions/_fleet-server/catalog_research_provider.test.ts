/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_provider.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyGeminiProviderError, minutesUntilNextDailyReset } from "./catalog_research_provider.ts";

Deno.test("R19: 402 maps to credits pause", () => {
  const r = classifyGeminiProviderError(new Error("gemini_http_402"));
  assertEquals(r?.pausedReason, "Gemini credits used up");
  assertEquals(r?.autoResumeMinutes, null);
});

Deno.test("R19: 401 and 403 map to key rejected", () => {
  assertEquals(classifyGeminiProviderError(new Error("gemini_http_401"))?.pausedReason, "Gemini key rejected");
  assertEquals(classifyGeminiProviderError(new Error("gemini_http_403"))?.pausedReason, "Gemini key rejected");
});

Deno.test("R19: 429 maps to rate limit with auto resume", () => {
  const r = classifyGeminiProviderError(new Error("gemini_http_429"));
  assertEquals(r?.pausedReason, "Gemini rate limit");
  assertEquals(r?.autoResumeMinutes, 15);
});

Deno.test("R19: non-gemini errors are ignored", () => {
  assertEquals(classifyGeminiProviderError(new Error("timeout")), null);
});

// ---------------------------------------------------------------------------
// RE-10 step 5 / RE-15: one provider-fault classification
// ---------------------------------------------------------------------------
const NOW = new Date("2026-11-21T22:00:00Z");

Deno.test("RE-10: our daily spend cap pauses until 00:05 UTC and is not a retry", () => {
  const err = Object.assign(new Error("Daily budget of $1.35 exceeded for gemini."), {
    name: "ProviderBlockedError",
    reason: "budget_daily",
    code: "PROVIDER_BLOCKED_BUDGET_DAILY",
  });
  const r = classifyGeminiProviderError(err, NOW);
  assertEquals([r?.cause, r?.autoResumeMinutes, r?.countsAsRetry], ["budget_daily", 125, false]);
});

Deno.test("RE-10: monthly cap waits for the 1st; kill switch waits for the owner", () => {
  const monthly = classifyGeminiProviderError({ code: "PROVIDER_BLOCKED_BUDGET_MONTHLY", message: "x" }, NOW);
  assertEquals([monthly?.cause, monthly?.autoResumeMinutes], ["budget_monthly", 9 * 24 * 60 + 2 * 60 + 5]);
  const ks = classifyGeminiProviderError({ reason: "killswitch", message: "x" }, NOW);
  assertEquals([ks?.cause, ks?.autoResumeMinutes], ["killswitch", null]);
});

Deno.test("RE-10: Google's daily grounding limit is matched before the generic 429", () => {
  const r = classifyGeminiProviderError(
    new Error('gemini_http_429: {"error":{"message":"Quota exceeded for Grounding with Google Search requests per day"}}'),
    NOW,
  );
  assertEquals([r?.cause, r?.autoResumeMinutes, r?.countsAsRetry], ["grounding_daily", 125, false]);
  assertEquals(classifyGeminiProviderError(new Error("gemini_http_429: slow down"), NOW)?.cause, "rate_limit");
});

Deno.test("RE-15: a retired model pauses without auto-resume and names the model", () => {
  const r = classifyGeminiProviderError(
    new Error("gemini_http_404: models/gemini-2.5-flash is no longer available. Please update your code to use models/gemini-3.8-flash"),
    NOW,
  );
  assertEquals(r?.cause, "model_retired");
  assertEquals(r?.autoResumeMinutes, null);
  assertEquals(r?.pausedReason, "Google no longer offers the model gemini-2.5-flash");
});

Deno.test("RE-15: Google 5xx pauses 15 minutes", () => {
  for (const s of [500, 502, 503, 504]) {
    const r = classifyGeminiProviderError(new Error(`gemini_http_${s}: oops`), NOW);
    assertEquals([r?.cause, r?.autoResumeMinutes], ["server_error", 15]);
  }
});

Deno.test("daily reset helper rolls to tomorrow after 00:05", () => {
  assertEquals(minutesUntilNextDailyReset(new Date("2026-11-21T00:04:00Z")), 1);
  assertEquals(minutesUntilNextDailyReset(new Date("2026-11-21T00:06:00Z")), 24 * 60 - 1);
});

Deno.test("review #7: a 400 about grounding that is not a limit is a normal failure, not a pause until midnight", () => {
  const r = classifyGeminiProviderError(
    new Error('gemini_http_400: {"error":{"message":"Search Grounding is not supported for this model."}}'),
    NOW,
  );
  assert(r?.cause !== "grounding_daily", String(r?.cause));
});
