/** Structured dual-write metrics for cutover ops (grep: unified_dual_write). */

export type DualWriteMetricStatus = "ok" | "skipped" | "fail";

export function logDualWriteMetric(payload: {
  source_system: string;
  status: DualWriteMetricStatus;
  reason?: string;
  source_id?: string | null;
  entry_type?: string | null;
  amount_minor?: number | null;
}): void {
  console.log(
    JSON.stringify({
      event: "unified_dual_write",
      ts: new Date().toISOString(),
      ...payload,
    }),
  );
}
