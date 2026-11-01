/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_trusted_source_block.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCatalogPartSearchPrompt } from "./catalog_research_gemini.ts";
import {
  consecutive403PairShouldBlock,
  filterDomainsForCatalogPrompt,
} from "./catalog_trusted_source_block.ts";
import { maybeAutoBlockTrustedSourceAfterFetch } from "./catalog_research_worker.ts";

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

Deno.test("R32: maybeAutoBlockTrustedSourceAfterFetch sets blocked_at after two 403s", async () => {
  let blockedPatch: Record<string, unknown> | null = null;
  let logged: Record<string, unknown> | null = null;
  const supabase = {
    from: (table: string) => {
      if (table === "catalog_trusted_source_fetch") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [{ http_status: 403 }, { http_status: 403 }],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "catalog_trusted_source") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { blocked_at: null }, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            blockedPatch = patch;
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      return {};
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === "catalog_research_log_event") logged = args;
      return Promise.resolve({ data: null, error: null });
    },
  };

  const blocked = await maybeAutoBlockTrustedSourceAfterFetch(supabase as never, {
    domain: "partsouq.com",
    jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assertEquals(blocked, true);
  assertEquals(typeof blockedPatch?.blocked_at, "string");
  assertEquals(logged?.p_outcome, "domain_blocked");
});
