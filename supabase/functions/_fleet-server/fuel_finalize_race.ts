/**
 * F-21: classify finalize job insert when two requests race on idempotency_key.
 */
export type FinalizeJobRow = { id: string; state: string };

export type FinalizeRaceOutcome =
  | { kind: "reuse"; job: FinalizeJobRow }
  | { kind: "created"; job: FinalizeJobRow }
  | { kind: "race"; job: FinalizeJobRow }
  | { kind: "error"; message: string };

export function resolveFinalizeJobRace(input: {
  existingBeforeInsert: FinalizeJobRow | null;
  inserted: FinalizeJobRow | null;
  insertErrorCode?: string | null;
  refetchAfterConflict: FinalizeJobRow | null;
}): FinalizeRaceOutcome {
  if (input.existingBeforeInsert) {
    return { kind: "reuse", job: input.existingBeforeInsert };
  }
  if (input.inserted) {
    return { kind: "created", job: input.inserted };
  }
  if (input.insertErrorCode === "23505" && input.refetchAfterConflict) {
    return { kind: "race", job: input.refetchAfterConflict };
  }
  return { kind: "error", message: "finalize_job_insert_failed" };
}