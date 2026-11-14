/**
 * Trips for driver pay (driver_financial_periods), and the driver filter it uses.
 * Moved out of the old toll period inputs (docs/toll-old-system-removal-audit.md S2): same trip read, no toll rows.
 */
import { iterateFleet } from "./repos/baseRepo.ts";

/**
 * Trip columns the driver pay rebuild reads.
 * payload_json stays out — it carries route geometry the screen does not show.
 */
const TRIP_DRIVER_COLUMNS = [
  "id",
  "organization_id",
  "date",
  "driver_id",
  "vehicle_id",
  "platform",
  "status",
  "amount",
  "payment_method",
  "service_line",
  "distance",
  "duration",
  "net_to_driver",
  // Week cash compares this to the Uber statement. Without it, cash trips
  // fall back to the fare and a real match looks like a mismatch.
  "cashCollected:payload_json->cashCollected",
  "tollCharges:payload_json->tollCharges",
  "dropoffTime:payload_json->dropoffTime",
  "requestTime:payload_json->requestTime",
  "startTime:payload_json->startTime",
  "pickupTime:payload_json->pickupTime",
  "tollRefundResolution:payload_json->tollRefundResolution",
  // Typed `date` is the UTC calendar day. Week cash uses Jamaica time, so a
  // Sunday evening trip must keep its real clock or it lands on Monday.
  "payloadDate:payload_json->date",
].join(",");

/** Every trip of these driver ids (all of a driver's aliases), oldest first. */
export async function loadDriverTripsForDrivers(driverIds: string[]): Promise<any[]> {
  const ids = [...new Set(driverIds.map(String).filter(Boolean))];
  if (!ids.length) return [];
  const trips: any[] = [];
  for await (const row of iterateFleet("trips", {
    filters: [{ op: "in", col: "driver_id", value: ids }],
    order: { col: "date", ascending: true },
    columns: TRIP_DRIVER_COLUMNS,
  })) {
    const instant = (row as { payloadDate?: unknown }).payloadDate;
    if (typeof instant === "string" && instant.includes("T")) {
      (row as { date?: string }).date = instant;
    }
    trips.push(row);
  }
  return trips.filter(Boolean);
}

export function filterByDriver(
  items: any[],
  driverId?: string,
  driverAliasMap?: Map<string, string>,
): any[] {
  if (!driverId) return items;
  if (!driverAliasMap) return items.filter((item: any) => item.driverId === driverId);
  const canonical = driverAliasMap.get(driverId) ?? driverId;
  return items.filter((item: any) => {
    const id = item.driverId;
    if (!id) return false;
    return (driverAliasMap.get(id) ?? id) === canonical;
  });
}
