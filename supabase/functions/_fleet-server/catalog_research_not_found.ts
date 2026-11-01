/**
 * Shared catalog job "Couldn't find" finalization (R30).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatSupabaseError } from "../_shared/formatSupabaseError.ts";
import { notifyFleetsRequestOutcome } from "./catalog_research_notify.ts";

const NOT_FOUND_RETRY_DAYS = 7;

export function catalogJobNotFoundRetryAt(from = Date.now()): string {
  return new Date(from + NOT_FOUND_RETRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function finalizeCatalogJobNotFound(
  supabase: SupabaseClient,
  input: {
    jobId: string;
    groupKey: string;
    msgId: number;
    queue: string;
    eventOutcome?: string;
    eventDetail?: Record<string, unknown>;
    actor?: string | null;
  },
): Promise<{ nextResearchAt: string }> {
  const nextAt = catalogJobNotFoundRetryAt();
  const now = new Date().toISOString();
  const outcome = input.eventOutcome ?? "no_search_results";

  const { error: jobErr } = await supabase.from("catalog_research_job").update({
    state: "not_found",
    next_research_at: nextAt,
    updated_at: now,
  }).eq("id", input.jobId);
  if (jobErr) throw new Error(formatSupabaseError(jobErr));

  const { error: reqErr } = await supabase.from("parts_sourcing_requests").update({
    status: "rejected",
    cant_find_at: now,
  }).eq("catalog_research_job_id", input.jobId).eq("kind", "add_part_info").in("status", ["open", "in_progress"]);
  if (reqErr) throw new Error(formatSupabaseError(reqErr));

  await notifyFleetsRequestOutcome(supabase, input.groupKey, "not_found");

  const { error: enqueueErr } = await supabase.rpc("catalog_research_enqueue_job", { p_job_id: input.jobId });
  if (enqueueErr) throw new Error(formatSupabaseError(enqueueErr));

  const { error: settingsErr } = await supabase.from("catalog_research_settings").update({ shadow_approve_streak: 0 }).eq("id", 1);
  if (settingsErr) throw new Error(formatSupabaseError(settingsErr));

  const { error: logErr } = await supabase.rpc("catalog_research_log_event", {
    p_job_id: input.jobId,
    p_step: "research",
    p_outcome: outcome,
    p_detail: { nextResearchAt: nextAt, ...(input.eventDetail ?? {}) },
    p_actor: input.actor ?? null,
  });
  if (logErr) throw new Error(formatSupabaseError(logErr));

  const { error: completeErr } = await supabase.rpc("catalog_research_complete_msg", {
    p_msg_id: input.msgId,
    p_queue: input.queue,
  });
  if (completeErr) throw new Error(formatSupabaseError(completeErr));

  return { nextResearchAt: nextAt };
}
