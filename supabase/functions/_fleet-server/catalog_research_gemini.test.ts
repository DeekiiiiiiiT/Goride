/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_gemini.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  attachGroundingSourcesToCandidates,
  buildCatalogPartResearchPrompt,
  buildCatalogPartSearchPrompt,
  countGroundingChunks,
  domainFromGroundingTitle,
  parseCandidatesFromGeminiText,
} from "./catalog_research_gemini.ts";

const recordedFixture = {
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          candidates: [
            {
              brand: "Toyota",
              partNumber: "90916-02729",
              partName: "Belt",
              matchType: "OEM",
              fits: {},
              sources: [{
                url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/BAD-MANGLED",
                quote: "OEM belt listing",
              }],
            },
            {
              brand: "Toyota",
              partNumber: "04465-12345",
              partName: "Pad",
              matchType: "OEM",
              fits: {},
              sources: [{ url: "https://evil.example/fake", quote: "pad quote" }],
            },
          ],
        }),
      }],
    },
    groundingMetadata: {
      groundingChunks: [
        { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/chunk0", title: "partsouq.com" } },
        { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/chunk1", title: "masuma.parts" } },
        { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/chunk2", title: "amayama.com" } },
      ],
      groundingSupports: [
        {
          segment: { text: "Part 90916-02729 V-ribbed belt on partsouq" },
          groundingChunkIndices: [0, 1],
        },
        {
          segment: { text: "04465-12345 brake pad" },
          groundingChunkIndices: [2],
        },
      ],
    },
  }],
};

Deno.test("R28: attach grounding URIs per candidate via supports; drop model URLs", () => {
  const text = recordedFixture.candidates[0].content.parts[0].text;
  const parsed = parseCandidatesFromGeminiText(text);
  const merged = attachGroundingSourcesToCandidates(parsed, recordedFixture);

  assertEquals(merged.length, 2);
  assertEquals(merged[0]?.sources.length, 2);
  assertEquals(merged[0]?.sources[0]?.url.includes("grounding-api-redirect/chunk0"), true);
  assertEquals(merged[0]?.sources[0]?.grounding_title, "partsouq.com");
  assertEquals(merged[0]?.sources[1]?.grounding_title, "masuma.parts");
  assertEquals(merged[0]?.sources.some((s) => s.url.includes("BAD-MANGLED")), false);
  assertEquals(merged[0]?.sources[0]?.quote, "OEM belt listing");

  assertEquals(merged[1]?.sources.length, 1);
  assertEquals(merged[1]?.sources[0]?.grounding_title, "amayama.com");
  assertEquals(merged[1]?.sources.some((s) => s.url.includes("evil.example")), false);
});

Deno.test("R28: no grounding chunks yields empty sources", () => {
  const parsed = { candidates: [{ brand: "X", partNumber: "1", partName: "P", matchType: "OEM", fits: {}, sources: [{ url: "http://x", quote: "" }] }] };
  const merged = attachGroundingSourcesToCandidates(parsed, { candidates: [{ content: { parts: [{ text: "{}" }] } }] });
  assertEquals(merged[0]?.sources, []);
});

Deno.test("R28: domainFromGroundingTitle parses catalogue domain", () => {
  assertEquals(domainFromGroundingTitle("partsouq.com"), "partsouq.com");
  assertEquals(domainFromGroundingTitle("www.masuma.parts"), "masuma.parts");
});

Deno.test("R30: buildCatalogPartSearchPrompt requires search without JSON block", () => {
  const prompt = buildCatalogPartSearchPrompt({
    searchQuery: "Toyota Roomy NCP50 1NR-FE Drive belt part number",
    promptContext: "Part type: Drive belt",
    trustedDomains: ["masuma.parts"],
  });
  assertEquals(prompt.startsWith("Use Google Search before answering."), true);
  assertEquals(prompt.includes("Return ONLY valid JSON"), false);
});

Deno.test("R30: countGroundingChunks sums candidate metadata", () => {
  assertEquals(countGroundingChunks({ candidates: [] }), 0);
  assertEquals(countGroundingChunks(recordedFixture), 3);
});
