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

/**
 * Review #9: every way a job ends as "Couldn't find" — Not on this page, Neither is right, the last proposal rejected,
 * a browser check left 30 days — closes the fleets' open asks for that job and tells them, like the worker does.
 */
export async function closeJobNotFound(
  supabase: SupabaseClient,
  jobId: string,
  outcome: string,
  actor: string | null,
  lastError?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: job, error: jobErr } = await supabase.from("catalog_research_job")
    .update({ state: "not_found", updated_at: now, ...(lastError ? { last_error: lastError } : {}) })
    .eq("id", jobId).select("group_key").maybeSingle();
  if (jobErr) throw new Error(formatSupabaseError(jobErr));
  await answerOpenAsksNotFound(supabase, jobId, (job as { group_key?: string } | null)?.group_key ?? null);
  await supabase.rpc("catalog_research_log_event", { p_job_id: jobId, p_step: "review", p_outcome: outcome, p_detail: {}, p_actor: actor });
}

/** Closes the job's open add_part_info asks as Couldn't find and notifies those fleets once. */
export async function answerOpenAsksNotFound(supabase: SupabaseClient, jobId: string, groupKey: string | null): Promise<number> {
  const { data: closed, error } = await supabase.from("parts_sourcing_requests")
    .update({ status: "rejected", cant_find_at: new Date().toISOString() })
    .eq("catalog_research_job_id", jobId).eq("kind", "add_part_info").in("status", ["open", "in_progress"])
    .select("id");
  if (error) throw new Error(formatSupabaseError(error));
  const ids = (closed ?? []).map((r) => String((r as { id: string }).id));
  if (ids.length && groupKey) await notifyFleetsRequestOutcome(supabase, groupKey, "not_found", ids);
  return ids.length;
}

/** Worker tick sweep: jobs that became Couldn't find in SQL (30-day browser-check expiry) still owe their fleets an answer. */
export async function sweepUnansweredNotFound(supabase: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const { data: jobs } = await supabase.from("catalog_research_job").select("id, group_key")
    .eq("state", "not_found").eq("job_type", "part").gte("updated_at", since).limit(200);
  if (!jobs?.length) return 0;
  const { data: open } = await supabase.from("parts_sourcing_requests").select("catalog_research_job_id")
    .in("catalog_research_job_id", jobs.map((j) => (j as { id: string }).id)).eq("kind", "add_part_info")
    .in("status", ["open", "in_progress"]);
  const owing = new Set((open ?? []).map((r) => String((r as { catalog_research_job_id: string }).catalog_research_job_id)));
  let n = 0;
  for (const j of jobs as Array<{ id: string; group_key: string }>) {
    if (owing.has(j.id)) n += await answerOpenAsksNotFound(supabase, j.id, j.group_key);
  }
  return n;
}
