/**
 * Answers teach Roam AT-11 / AT-12: the question card a browser check carries — the saved-page row Roam read, still
 * waiting for the owner's answer. The browser check drawer opens on it (plan §5.2).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ResultRow, SavedPageResult } from "./research_saved_page_routes.ts";

export type JobQuestion = {
  savedPageId: string;
  domain: string | null;
  readAt: string;
  lineNo: number;
  partType: string;
  place: string | null;
  groupLine: string | null;
  lineText: string;
  number: string | null;
  dates: string | null;
  question: NonNullable<ResultRow["question"]>;
};

/** The newest unanswered question on this car's saved pages that rides on this job, or null. */
export async function findQuestionForJob(
  supabase: SupabaseClient,
  jobId: string,
  vehicleId: string,
): Promise<JobQuestion | null> {
  const { data, error } = await supabase.from("research_saved_page")
    .select("id, domain, created_at, result")
    .eq("vehicle_catalog_id", vehicleId).eq("status", "done")
    .order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  for (const page of (data ?? []) as Array<{ id: string; domain: string | null; created_at: string; result: SavedPageResult | null }>) {
    const row = (page.result?.rows ?? []).find((r) => r.jobId === jobId && r.question && !r.question.answer);
    if (!row?.question) continue;
    return {
      savedPageId: page.id,
      domain: page.domain,
      readAt: page.created_at,
      lineNo: row.lineNo,
      partType: row.partType,
      place: row.place,
      groupLine: row.groupLine,
      lineText: row.lineText,
      number: row.number,
      dates: row.dates,
      question: row.question,
    };
  }
  return null;
}
