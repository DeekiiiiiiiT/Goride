/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_gemini.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mergeGroundingSources, parseCandidatesFromGeminiText } from "./catalog_research_gemini.ts";

const fixture = {
  candidates: [{
    content: {
      parts: [{
        text: '{"candidates":[{"brand":"Toyota","partNumber":"04465-12345","partName":"Pad","matchType":"OEM","fits":{},"sources":[]}]}',
      }],
    },
    groundingMetadata: {
      groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/redirect/1" } }],
    },
  }],
};

Deno.test("R2: merge grounding chunk URIs into candidates", () => {
  const parsed = parseCandidatesFromGeminiText(fixture.candidates[0].content.parts[0].text);
  const merged = mergeGroundingSources(parsed, fixture);
  assertEquals(merged[0]?.sources.some((s) => s.url.includes("vertexaisearch")), true);
});
