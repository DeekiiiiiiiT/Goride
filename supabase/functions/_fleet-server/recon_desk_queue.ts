/**
 * One way to ask the week calculator to work a week out again (WRA-43). Every caller goes through here, so the
 * request always names its delay (`public.recon_enqueue_week_desk(p_org, p_line, p_week, p_delay_seconds)`).
 * The worker drops a request that a later build already covers (recon_worker.ts publishDeskWhenQuiet), so
 * asking twice is cheap.
 */
import { getServiceClient } from "./service_client.ts";

/** Same as the user publish hold (recon.claim_week_change): a burst of changes ends in one publish. */
export const OTHER_LINE_DELAY_SECONDS = 120;

export async function enqueueWeekDesk(
  orgId: string,
  serviceLine: string,
  weekKey: string,
  delaySeconds = 0,
): Promise<void> {
  const { error } = await getServiceClient().rpc("recon_enqueue_week_desk", {
    p_org: orgId,
    p_line: serviceLine,
    p_week: String(weekKey).slice(0, 10),
    p_delay_seconds: Math.max(0, Math.floor(delaySeconds)),
  });
  if (error) throw new Error(`recon_enqueue_week_desk failed: ${error.message}`);
}

/**
 * Queue a desk publish for every existing week run (every service line) of these weeks: a toll or fuel change can
 * move both the Rideshare and the Delivery week. `heldLine` is the line the user is working in; it already has the
 * publish hold, so it is asked at once and the worker waits out the hold. Other lines have no hold, so they wait
 * the same time here instead of publishing (and moving their version) at once. Never throws.
 */
export async function queueWeekDeskRefresh(
  orgId: string,
  weekKeys: string[],
  opts: { heldLine?: string } = {},
): Promise<void> {
  const weeks = [...new Set(weekKeys.map((w) => String(w).slice(0, 10)))].filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w));
  if (!orgId || weeks.length === 0) return;
  try {
    const { data: runs, error } = await getServiceClient().schema("recon").from("week_runs")
      .select("service_line, week_key")
      .eq("organization_id", orgId)
      .in("week_key", weeks);
    if (error) throw error;
    await Promise.all(
      ((runs ?? []) as Array<{ service_line: string; week_key: string }>).map(async (run) => {
        const delay = opts.heldLine && run.service_line !== opts.heldLine ? OTHER_LINE_DELAY_SECONDS : 0;
        try {
          await enqueueWeekDesk(orgId, run.service_line, String(run.week_key).slice(0, 10), delay);
        } catch (e) {
          console.warn("[recon] desk refresh failed", e instanceof Error ? e.message : e);
        }
      }),
    );
  } catch (e) {
    console.warn("[recon] desk refresh failed", e instanceof Error ? e.message : e);
  }
}
