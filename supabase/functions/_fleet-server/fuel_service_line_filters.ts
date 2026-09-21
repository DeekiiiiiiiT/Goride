/**
 * R3 — server list filters for GET /fuel-entries ?serviceLine=
 * Parity with client fuelEntryMatchesLineFilter (S2):
 * - line tabs exclude source=unattributed
 * - unattributed = null line OR source=unattributed
 */
import type { FleetQueryFilter } from "./repos/baseRepo.ts";

export function buildFuelEntryServiceLineFilters(
  serviceLineRaw: string,
): FleetQueryFilter[] {
  const raw = String(serviceLineRaw || "").trim().toLowerCase();
  if (raw === "rideshare" || raw === "rush_delivery") {
    return [
      { op: "eq", col: "service_line", value: raw },
      // Prefer OR so NULL sources are not dropped by PostgREST neq null semantics
      {
        op: "or",
        value: "service_line_source.is.null,service_line_source.neq.unattributed",
      },
    ];
  }
  if (raw === "unattributed") {
    return [
      {
        op: "or",
        value: "service_line.is.null,service_line_source.eq.unattributed",
      },
    ];
  }
  return [];
}
