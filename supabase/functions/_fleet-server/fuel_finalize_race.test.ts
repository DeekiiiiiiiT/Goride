import { assertEquals } from "jsr:@std/assert@1.0.13";
import { resolveFinalizeJobRace } from "./fuel_finalize_race.ts";

Deno.test("F-21: concurrent finalize reuses existing job", () => {
  const out = resolveFinalizeJobRace({
    existingBeforeInsert: { id: "j1", state: "queued" },
    inserted: null,
    insertErrorCode: null,
    refetchAfterConflict: null,
  });
  assertEquals(out, { kind: "reuse", job: { id: "j1", state: "queued" } });
});

Deno.test("F-21: unique violation refetch returns race job not double queue", () => {
  const out = resolveFinalizeJobRace({
    existingBeforeInsert: null,
    inserted: null,
    insertErrorCode: "23505",
    refetchAfterConflict: { id: "j2", state: "running" },
  });
  assertEquals(out, { kind: "race", job: { id: "j2", state: "running" } });
});