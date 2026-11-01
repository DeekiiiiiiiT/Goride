/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_provider.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyGeminiProviderError } from "./catalog_research_provider.ts";

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
