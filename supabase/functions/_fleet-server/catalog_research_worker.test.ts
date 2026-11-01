/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_worker.test.ts
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finalizeCatalogJobNotFound } from "./catalog_research_not_found.ts";
import { handleGeminiProviderFault } from "./catalog_research_worker.ts";

Deno.test("R22: handleGeminiProviderFault throws when complete_msg rpc fails", async () => {
  const supabase = {
    rpc: (fn: string) => {
      if (fn === "catalog_research_complete_msg") {
        return Promise.resolve({
          data: null,
          error: { message: "function catalog_research_complete_msg(bigint) does not exist" },
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { auto_resume_attempt: 0 }, error: null }),
        }),
      }),
    }),
  };

  await assertRejects(
    () =>
      handleGeminiProviderFault(supabase as never, {
        jobId: "11111111-1111-4111-8111-111111111111",
        msgId: 42,
        queue: "catalog_research",
        provider: { pausedReason: "rate_limit", httpStatus: 429, autoResumeMinutes: 15 },
      }),
    Error,
    "rpc catalog_research_complete_msg",
  );
});

Deno.test("R30: finalizeCatalogJobNotFound logs no_search_results and skips proposal insert", async () => {
  const events: Array<{ outcome: string; detail: Record<string, unknown> }> = [];
  const inserts: string[] = [];
  const jobId = "b3e3cc56-1111-4111-8111-111111111111";

  const queryChain = {
    eq: () => queryChain,
    in: () => queryChain,
    is: () => queryChain,
    not: () => queryChain,
    order: () => queryChain,
    limit: () => queryChain,
    then(resolve: (v: unknown) => void) {
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  };

  const supabase = {
    from(table: string) {
      return {
        update(_patch: Record<string, unknown>) {
          return {
            eq: () => ({
              eq: () => ({
                in: () => Promise.resolve({ error: null }),
              }),
            }),
          };
        },
        insert(_rows: unknown) {
          inserts.push(table);
          return Promise.resolve({ error: null });
        },
        select: () => queryChain,
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "catalog_research_log_event") {
        events.push({
          outcome: String(args.p_outcome),
          detail: (args.p_detail || {}) as Record<string, unknown>,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  await finalizeCatalogJobNotFound(supabase as never, {
    jobId,
    groupKey: "test-group",
    msgId: 9,
    queue: "catalog_research",
    eventDetail: { groundingChunks: 0, attempts: 2 },
  });

  assertEquals(inserts.includes("catalog_part_proposal"), false);
  assertEquals(events.some((e) => e.outcome === "no_search_results"), true);
  assertEquals(events.find((e) => e.outcome === "no_search_results")?.detail.groundingChunks, 0);
});
