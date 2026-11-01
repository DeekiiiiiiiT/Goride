/**
 * deno test --no-check supabase/functions/_fleet-server/catalog_research_worker.test.ts
 */
import { assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
