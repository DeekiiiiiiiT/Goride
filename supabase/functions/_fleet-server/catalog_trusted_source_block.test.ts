/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_trusted_source_block.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCatalogPartSearchPrompt } from "./catalog_research_gemini.ts";
import {
  consecutive403PairShouldBlock,
  filterDomainsForCatalogPrompt,
} from "./catalog_trusted_source_block.ts";

Deno.test("R32: two consecutive 403s should block", () => {
  assertEquals(consecutive403PairShouldBlock([403, 403]), true);
  assertEquals(consecutive403PairShouldBlock([403]), false);
  assertEquals(consecutive403PairShouldBlock([403, 429]), false);
});

Deno.test("R32: 403 then 200 should not block", () => {
  assertEquals(consecutive403PairShouldBlock([200, 403]), false);
  assertEquals(consecutive403PairShouldBlock([403, 200]), false);
});

Deno.test("R32: blocked domain omitted from Prefer catalogue prompt line", () => {
  const all = ["amayama.com", "partsouq.com", "7zap.com"];
  const forPrompt = filterDomainsForCatalogPrompt(all.filter((d) => d !== "partsouq.com"));
  const prompt = buildCatalogPartSearchPrompt({
    searchQuery: "Toyota drive belt part number",
    promptContext: "Part type: Drive belt",
    trustedDomains: forPrompt,
  });
  assertEquals(prompt.includes("partsouq.com"), false);
  assertEquals(prompt.includes("amayama.com"), true);
});

// The worker no longer auto-blocks through catalog_trusted_source: research_page_reader.ts blocks a site after
// two 401/403 reads in a row (tested in research_page_reader.test.ts).
