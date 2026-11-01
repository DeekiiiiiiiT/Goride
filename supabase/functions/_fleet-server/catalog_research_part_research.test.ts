/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_part_research.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  filterCandidatesWithGroundingSources,
  geminiHttpErrorDetail,
  runPartGeminiResearchWithRetry,
} from "./catalog_research_part_research.ts";

Deno.test("R30: filterCandidatesWithGroundingSources drops empty sources", () => {
  const kept = filterCandidatesWithGroundingSources([
    { brand: "A", partNumber: "1", partName: "P", matchType: "OEM", fits: {}, sources: [] },
    { brand: "B", partNumber: "2", partName: "P", matchType: "OEM", fits: {}, sources: [{ url: "u", quote: "q" }] },
  ]);
  assertEquals(kept.length, 1);
  assertEquals(kept[0]?.brand, "B");
});

Deno.test("R30: runPartGeminiResearchWithRetry calls twice when chunks stay zero", async () => {
  let calls = 0;
  let retries = 0;
  const empty = {
    model: "gemini-2.5-flash",
    candidates: [{ brand: "X", partNumber: "1", partName: "P", matchType: "OEM", fits: {}, sources: [] }],
    raw: { candidates: [{ content: { parts: [{ text: "{}" }] } }] },
  };
  const out = await runPartGeminiResearchWithRetry(
    async () => {
      calls += 1;
      return empty;
    },
    async () => {
      retries += 1;
    },
  );
  assertEquals(calls, 2);
  assertEquals(retries, 1);
  assertEquals(out.groundingChunks, 0);
  assertEquals(out.research.candidates.length, 0);
});

Deno.test("R30: runPartGeminiResearchWithRetry keeps sourced candidates when chunks present", async () => {
  const fixture = {
    model: "gemini-2.5-flash",
    candidates: [
      { brand: "Toyota", partNumber: "90916-02729", partName: "Belt", matchType: "OEM", fits: {}, sources: [{ url: "https://x", quote: "q" }] },
    ],
    raw: {
      candidates: [{
        content: { parts: [{ text: "{}" }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: "https://x", title: "masuma.parts" } }] },
      }],
    },
  };
  const out = await runPartGeminiResearchWithRetry(async () => fixture, async () => {});
  assertEquals(out.attempts, 1);
  assertEquals(out.groundingChunks, 1);
  assertEquals(out.research.candidates.length, 1);
});

Deno.test("R30: geminiHttpErrorDetail parses 400 body snippet", () => {
  const detail = geminiHttpErrorDetail(new Error('gemini_http_400: {"error":"bad request"}'));
  assertEquals(detail?.status, 400);
  assertEquals(detail?.bodySnippet.includes("bad request"), true);
});
