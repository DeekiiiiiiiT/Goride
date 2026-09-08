/**
 * Odometer sequence health gate for merchant-name auto-heal.
 * Healthy = no regression vs prev (and vs next when present); gap within max.
 */

import * as fuelLogic from "./fuel_logic.ts";

export type OdometerNeighbor = {
  id?: string;
  date?: string;
  odometer?: number | string | null;
};

export type OdometerHealthResult = {
  healthy: boolean;
  reason: string | null;
  /** True when there was no previous fill — caller may require stronger merchant score. */
  isFirstFill: boolean;
};

const DEFAULT_MAX_EXPECTED_DISTANCE = 800; // km between fills; soft cap for heal gate

function validOdo(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

/**
 * Pure check given current odo + optional prev/next neighbors.
 */
export function evaluateOdometerSequenceHealth(params: {
  currentOdo: number | null;
  prevOdo: number | null;
  nextOdo?: number | null;
  maxExpectedDistance?: number;
}): OdometerHealthResult {
  const maxExpected = params.maxExpectedDistance ?? DEFAULT_MAX_EXPECTED_DISTANCE;
  const current = params.currentOdo;

  if (current == null || current <= 0) {
    return { healthy: false, reason: "Missing or zero odometer", isFirstFill: false };
  }

  const prev = params.prevOdo;
  const isFirstFill = prev == null || prev <= 0;

  if (!isFirstFill && prev != null) {
    const audit = fuelLogic.auditOdometerSequence({
      currentOdo: current,
      prevOdo: prev,
      maxExpectedDistance: maxExpected,
    });
    if (audit.status === "critical") {
      return { healthy: false, reason: audit.reason || "Odometer regression", isFirstFill: false };
    }
    // Treat large gap / stagnation as unhealthy for silent auto-heal (ops can still Silent Attach)
    if (audit.status === "warning") {
      return { healthy: false, reason: audit.reason || "Odometer sequence warning", isFirstFill: false };
    }
  }

  const next = params.nextOdo;
  if (next != null && next > 0) {
    if (next < current) {
      return { healthy: false, reason: "Next fill odometer regression", isFirstFill };
    }
    const forward = fuelLogic.auditOdometerSequence({
      currentOdo: next,
      prevOdo: current,
      maxExpectedDistance: maxExpected,
    });
    if (forward.status === "critical") {
      return { healthy: false, reason: forward.reason || "Next-neighbor odometer issue", isFirstFill };
    }
  }

  return { healthy: true, reason: null, isFirstFill };
}

function entrySortMs(e: { date?: string; time?: string | null }): number {
  const dateRaw = String(e.date || "");
  const timeRaw = String(e.time || "").trim();
  if (dateRaw.includes("T")) {
    const t = new Date(dateRaw).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    const [y, mo, d] = dateRaw.split("-").map(Number);
    const tm = timeRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const hh = tm ? Number(tm[1]) : 0;
    const mm = tm ? Number(tm[2]) : 0;
    const ss = tm ? Number(tm[3] || 0) : 0;
    return new Date(y, mo - 1, d, hh, mm, ss).getTime();
  }
  const t = new Date(dateRaw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Async health check using previous fill lookup + optional same-vehicle timeline for next.
 */
export async function odometerSequenceHealthy(
  entry: {
    id?: string;
    vehicleId?: string;
    date?: string;
    odometer?: number | string | null;
  },
  opts?: {
    maxExpectedDistance?: number;
    /** Optional preloaded same-vehicle entries (avoids extra scans in batch). */
    vehicleTimeline?: OdometerNeighbor[];
  },
): Promise<OdometerHealthResult> {
  const current = validOdo(entry.odometer);
  if (current == null) {
    return { healthy: false, reason: "Missing or zero odometer", isFirstFill: false };
  }
  if (!entry.vehicleId || !entry.date) {
    // Without vehicle/date we cannot prove sequence — treat as first-fill-like (caller may require strong merchant)
    return { healthy: true, reason: null, isFirstFill: true };
  }

  let prevOdo: number | null = null;
  let nextOdo: number | null = null;

  if (opts?.vehicleTimeline && opts.vehicleTimeline.length > 0) {
    const sorted = [...opts.vehicleTimeline].sort((a, b) => entrySortMs(a) - entrySortMs(b));
    const idx = sorted.findIndex((e) => e.id && entry.id && e.id === entry.id);
    const at = idx >= 0 ? idx : sorted.findIndex((e) => entrySortMs(e) >= entrySortMs(entry));
    const i = at >= 0 ? at : sorted.length;
    for (let j = (idx >= 0 ? idx : i) - 1; j >= 0; j--) {
      const o = validOdo(sorted[j].odometer);
      if (o != null) {
        prevOdo = o;
        break;
      }
    }
    for (let j = (idx >= 0 ? idx : i) + 1; j < sorted.length; j++) {
      const o = validOdo(sorted[j].odometer);
      if (o != null) {
        nextOdo = o;
        break;
      }
    }
  } else {
    const prev = await fuelLogic.getPreviousFuelEntry(
      entry.vehicleId,
      String(entry.date).slice(0, 10),
      entry.id,
    );
    prevOdo = validOdo(prev?.odometer);
  }

  return evaluateOdometerSequenceHealth({
    currentOdo: current,
    prevOdo,
    nextOdo,
    maxExpectedDistance: opts?.maxExpectedDistance,
  });
}

export const ODOMETER_HEALTH_DEFAULTS = {
  maxExpectedDistanceKm: DEFAULT_MAX_EXPECTED_DISTANCE,
};
