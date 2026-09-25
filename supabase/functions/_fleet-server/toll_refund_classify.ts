/**
 * Unlinked-refund suggestion classifier (geo + rate signals).
 * Kept out of toll_controller.tsx so fuel Deno CI / readiness builders
 * do not pull the toll HTTP megafile (N-9b).
 */
import * as kv from "./kv_store.tsx";

export type RefundResolutionStatus = "cash_wash" | "phantom" | "expense_logged" | "pending";

export interface RefundClassification {
  status: RefundResolutionStatus;
  confidence: number;
  reason: string;
}

interface ActivePlaza {
  lat: number;
  lng: number;
}

const DEFAULT_PLAZA_RADIUS_M = 500;

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function loadActivePlazaPoints(): Promise<ActivePlaza[]> {
  const raw = await kv.getByPrefix("toll_plaza:");
  const points: ActivePlaza[] = [];
  for (const v of raw || []) {
    if (!v || typeof v !== "object") continue;
    if (v.status && v.status !== "active") continue;
    const loc = v.location;
    if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
      points.push({ lat: loc.lat, lng: loc.lng });
    }
  }
  return points;
}

/** Min meters from a trip's pickup/dropoff coords to any active plaza, or null. */
export function nearestPlazaMetersForTrip(trip: any, plazas: ActivePlaza[]): number | null {
  if (plazas.length === 0) return null;
  const coords: Array<[number, number]> = [];
  if (typeof trip.startLat === "number" && typeof trip.startLng === "number") {
    coords.push([trip.startLat, trip.startLng]);
  }
  if (typeof trip.endLat === "number" && typeof trip.endLng === "number") {
    coords.push([trip.endLat, trip.endLng]);
  }
  if (coords.length === 0) return null;
  let min = Infinity;
  for (const [lat, lng] of coords) {
    for (const p of plazas) {
      const d = haversineMeters(lat, lng, p.lat, p.lng);
      if (d < min) min = d;
    }
  }
  return isFinite(min) ? min : null;
}

function isCashSettledServer(platform?: string, paymentMethod?: string): boolean {
  const pm = (paymentMethod || "").toLowerCase();
  const pf = (platform || "").toLowerCase();
  return pm === "cash" || pf === "cash";
}

export function classifyRefundServer(params: {
  tollCharges: number;
  platform?: string;
  paymentMethod?: string;
  nearestPlazaMeters: number | null;
  plazaRadiusMeters?: number;
  pendingTagImport?: boolean;
  /** True when trip.tollCharges matches a Super Admin Toll Info rate. */
  matchesOfficialRate?: boolean;
}): RefundClassification {
  const {
    tollCharges,
    platform,
    paymentMethod,
    nearestPlazaMeters,
    plazaRadiusMeters = DEFAULT_PLAZA_RADIUS_M,
    pendingTagImport = false,
  } = params;

  if (!(tollCharges > 0)) {
    return { status: "pending", confidence: 0, reason: "No positive toll refund on this trip." };
  }
  if (pendingTagImport) {
    return {
      status: "pending",
      confidence: 60,
      reason: "A tag statement for this period is expected; will auto-match on import.",
    };
  }
  const cashSettled = isCashSettledServer(platform, paymentMethod);
  const hasGeo = typeof nearestPlazaMeters === "number" && nearestPlazaMeters >= 0;
  const nearPlaza = hasGeo && (nearestPlazaMeters as number) <= plazaRadiusMeters;

  if (cashSettled && nearPlaza) {
    return {
      status: "cash_wash",
      confidence: 92,
      reason: "Cash-settled fare and a toll plaza on-route — driver paid cash. No leakage.",
    };
  }
  if (cashSettled && !hasGeo) {
    return {
      status: "cash_wash",
      confidence: 80,
      reason: "Cash-settled fare reimbursed the toll — driver most likely paid cash.",
    };
  }
  if (!cashSettled && nearPlaza) {
    return {
      status: "cash_wash",
      confidence: 70,
      reason: "A toll plaza sits on this route; likely paid in cash and reimbursed.",
    };
  }
  if (params.matchesOfficialRate) {
    return {
      status: "cash_wash",
      confidence: 75,
      reason: "Refund amount matches Super Admin Toll Info rate — likely cash wash.",
    };
  }
  if (hasGeo && !nearPlaza) {
    return {
      status: "phantom",
      confidence: 64,
      reason: "No toll plaza near this route — likely a platform fare estimate.",
    };
  }
  return {
    status: "pending",
    confidence: 40,
    reason: "Insufficient signal; leaving pending for tag-statement import.",
  };
}

export function isSafeAutoApplyServer(c: RefundClassification, minConfidence: number): boolean {
  return c.status === "cash_wash" && c.confidence >= minConfidence;
}

/**
 * Suggestion status per unresolved unlinked-refund trip — used by GET /periods
 * so Accept suggestions stay visible; pending-hold itself is actionable
 * (product decision A / isUnlinkedRefundActionableNow).
 */
export async function buildUnresolvedRefundSuggestionStatuses(
  unresolvedTrips: any[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!unresolvedTrips.length) return out;
  const plazas = await loadActivePlazaPoints();
  const { amountMatchesAnyOfficialRate } = await import("./toll_rate_schedule.ts");
  for (const t of unresolvedTrips) {
    if (!t?.id) continue;
    const nearest = nearestPlazaMetersForTrip(t, plazas);
    const matchesOfficialRate = await amountMatchesAnyOfficialRate(
      Number(t.tollCharges) || 0,
      t.date,
    );
    const cls = classifyRefundServer({
      tollCharges: Number(t.tollCharges) || 0,
      platform: t.platform,
      paymentMethod: t.paymentMethod,
      nearestPlazaMeters: nearest,
      matchesOfficialRate,
    });
    out.set(String(t.id), cls.status);
  }
  return out;
}
