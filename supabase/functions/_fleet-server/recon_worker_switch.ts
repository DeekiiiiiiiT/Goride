/**
 * Week-calculator status for roamfleet.co/admin.
 * The calculator starts itself. This page only reports that, and can stop it in an emergency.
 */

export const WEEK_CALCULATOR_COST_NOTE =
  "It starts on its own when a week changes, then stops. A quiet month stays near zero.";

export const LARGER_FLEET_HOLD_NOTE =
  "Do not close a larger fleet until seven nights in a row are clean, and those nights include a real upload or payment.";

export type WeekCalculatorState =
  | "disconnected"
  | "stopped"
  | "working"
  | "idle"
  | "needs_a_look";

export type WeekCalculatorNight = {
  at: string;
  kind: string;
  mismatches?: number;
};

const MESSAGES: Record<WeekCalculatorState, string> = {
  disconnected: "The calculator could not be read.",
  stopped: "Stopped. Updates and closes wait until you resume.",
  working: "Working. Updating the weeks that changed.",
  idle: "Idle. It starts on its own when something changes.",
  needs_a_look: "Needs a look. The last check found a money difference. Close stays blocked until that is fixed.",
};

function result(state: WeekCalculatorState): { state: WeekCalculatorState; message: string } {
  return { state, message: MESSAGES[state] };
}

/** Google stores the awake setting on the computer, not on the outer service row. */
export function minInstancesFromService(service: {
  scaling?: { minInstanceCount?: number | null };
  template?: { scaling?: { minInstanceCount?: number | null } };
} | null): number {
  const templateMin = service?.template?.scaling?.minInstanceCount;
  if (templateMin != null && Number.isFinite(Number(templateMin))) return Number(templateMin);
  const serviceMin = service?.scaling?.minInstanceCount;
  if (serviceMin != null && Number.isFinite(Number(serviceMin))) return Number(serviceMin);
  return 0;
}

export function weekCalculatorStatus(input: {
  connected: boolean;
  emergencyOff: boolean;
  queueWaiting: number;
  closeRunning: boolean;
  nightlyInProgress: boolean;
  lastFinishKind: "shadow_ok" | "shadow_mismatch" | null;
}): { state: WeekCalculatorState; message: string } {
  if (!input.connected) return result("disconnected");
  if (input.emergencyOff) return result("stopped");
  if (input.queueWaiting > 0 || input.closeRunning || input.nightlyInProgress) return result("working");
  if (input.lastFinishKind === "shadow_mismatch") return result("needs_a_look");
  return result("idle");
}

function dayNumber(isoDay: string): number {
  return Math.floor(Date.parse(`${isoDay}T00:00:00Z`) / 86_400_000);
}

/**
 * True until seven calendar nights in a row are clean and the newest of them is today or yesterday.
 * A quiet hour of the same data does not count: the nights have to be real daily checks.
 */
export function largerFleetHold(nights: WeekCalculatorNight[], nowIso: string): boolean {
  const byDay = new Map<string, WeekCalculatorNight>();
  for (const night of nights) {
    const day = String(night.at || "").slice(0, 10);
    if (!day || byDay.has(day)) continue;
    byDay.set(day, night);
  }
  const days = [...byDay.keys()].sort();
  const last7 = days.slice(-7);
  if (last7.length < 7) return true;
  for (let i = 1; i < last7.length; i++) {
    if (dayNumber(last7[i]) - dayNumber(last7[i - 1]) !== 1) return true;
  }
  const newest = dayNumber(last7[last7.length - 1]);
  const today = dayNumber(nowIso.slice(0, 10));
  if (!Number.isFinite(newest) || !Number.isFinite(today) || today - newest > 1) return true;
  for (const day of last7) {
    const night = byDay.get(day);
    if (!night) return true;
    if (night.kind !== "shadow_ok" || Number(night.mismatches || 0) > 0) return true;
  }
  return false;
}

/** Newest result for each night, newest night first. */
export function latestNights(nights: WeekCalculatorNight[], limit = 7): WeekCalculatorNight[] {
  const seen = new Set<string>();
  const out: WeekCalculatorNight[] = [];
  for (const night of nights) {
    const day = String(night.at || "").slice(0, 10);
    if (!day || seen.has(day)) continue;
    seen.add(day);
    out.push(night);
    if (out.length >= limit) break;
  }
  return out;
}
