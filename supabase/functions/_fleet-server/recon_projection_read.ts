import { getServiceClient } from "./service_client.ts";
import { projectionStatusLine } from "./recon_projection.ts";

export type WeekProjectionStatus = {
  pendingDrivers: number;
  failedDrivers: number;
  totalDrivers: number;
  line: string | null;
};

export async function loadWeekProjectionStatus(
  orgId: string,
  weekKey: string,
): Promise<WeekProjectionStatus> {
  const empty = { pendingDrivers: 0, failedDrivers: 0, totalDrivers: 0, line: null };
  try {
    const { data, error } = await getServiceClient()
      .schema("recon")
      .from("projection_state")
      .select("status, unit_kind")
      .eq("organization_id", orgId)
      .eq("week_key", weekKey)
      .eq("unit_kind", "driver_week");
    if (error || !data) return empty;
    let pending = 0;
    let failed = 0;
    for (const row of data) {
      const status = String((row as { status?: string }).status || "");
      if (status === "pending") pending += 1;
      if (status === "failed") failed += 1;
    }
    return {
      pendingDrivers: pending,
      failedDrivers: failed,
      totalDrivers: data.length,
      line: projectionStatusLine(pending, failed, data.length),
    };
  } catch {
    return empty;
  }
}

export type StoredWeekBlocker = {
  code: string;
  severity: string;
  driver_id: string | null;
  source_id: string | null;
  message: string | null;
  persisted: number | null;
  expected: number | null;
  delta: number | null;
};

/** Saved blockers for a week. Throws on a failed read: an error must never look like "nothing to fix". */
export async function loadWeekBlockerRows(
  orgId: string,
  weekKey: string,
  serviceLine: string,
): Promise<StoredWeekBlocker[]> {
  const { data, error } = await getServiceClient()
    .schema("recon")
    .from("week_blockers")
    .select("code, severity, driver_id, source_id, message, persisted, expected, delta")
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("service_line", serviceLine);
  if (error) throw new Error(`week blockers read failed: ${error.message}`);
  return (data ?? []) as StoredWeekBlocker[];
}
