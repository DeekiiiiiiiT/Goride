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

export async function loadWeekBlockerRows(
  orgId: string,
  weekKey: string,
  serviceLine: string,
): Promise<Array<{ code: string; severity: string; driver_id: string | null; message: string | null }>> {
  try {
    const { data, error } = await getServiceClient()
      .schema("recon")
      .from("week_blockers")
      .select("code, severity, driver_id, message")
      .eq("organization_id", orgId)
      .eq("week_key", weekKey)
      .eq("service_line", serviceLine);
    if (error || !data) return [];
    return data as Array<{ code: string; severity: string; driver_id: string | null; message: string | null }>;
  } catch {
    return [];
  }
}
