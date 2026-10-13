/** One open alert per vehicle and component, even when several replacements fall in the window. */

export type ReplacementEvent = {
  vehicleId: string;
  componentId: string;
  odometer: number | null;
  at: string;
  partNumber?: string | null;
  brand?: string | null;
};

export type RepeatAlert = {
  kind: "component" | "supplier_batch";
  vehicleId: string | null;
  componentId: string | null;
  partNumber: string | null;
  brand: string | null;
};

const DEFAULT_KM = 10000;
const DEFAULT_DAYS = 90;

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return ms / (24 * 60 * 60 * 1000);
}

export function repeatFailureAlerts(
  events: ReplacementEvent[],
  opts?: { km?: number; days?: number; minVehicles?: number },
): RepeatAlert[] {
  const km = opts?.km ?? DEFAULT_KM;
  const days = opts?.days ?? DEFAULT_DAYS;
  const minVehicles = opts?.minVehicles ?? 3;
  const alerts: RepeatAlert[] = [];
  const groups = new Map<string, ReplacementEvent[]>();
  for (const event of events) {
    const key = `${event.vehicleId}::${event.componentId}`;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    let hit = false;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const kmOk = prev.odometer != null && cur.odometer != null && Math.abs(cur.odometer - prev.odometer) <= km;
      const dayOk = daysBetween(prev.at, cur.at) <= days;
      if (kmOk || dayOk) {
        hit = true;
        break;
      }
    }
    if (hit) {
      const last = sorted[sorted.length - 1];
      alerts.push({
        kind: "component",
        vehicleId: last.vehicleId,
        componentId: last.componentId,
        partNumber: last.partNumber ?? null,
        brand: last.brand ?? null,
      });
    }
  }

  const byNumber = new Map<string, Set<string>>();
  const brandByNumber = new Map<string, string | null>();
  for (const event of events) {
    const num = (event.partNumber ?? "").trim().toUpperCase();
    if (!num) continue;
    const set = byNumber.get(num) ?? new Set<string>();
    set.add(event.vehicleId);
    byNumber.set(num, set);
    if (!brandByNumber.has(num)) brandByNumber.set(num, event.brand ?? null);
  }
  for (const [num, vehicles] of byNumber) {
    if (vehicles.size >= minVehicles) {
      alerts.push({
        kind: "supplier_batch",
        vehicleId: null,
        componentId: null,
        partNumber: num,
        brand: brandByNumber.get(num) ?? null,
      });
    }
  }
  return alerts;
}
