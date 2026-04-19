/**
 * Pure helpers for maintenance template to vehicle schedule row (next due / fulfillment).
 * Odometer fields are unit-agnostic (km or mi); keep fleet and templates consistent.
 */

export type FrequencyKind = "recurring" | "once_milestone" | "manual_only";

export function addMonthsIso(ymd: string, months: number): string {
  const d = new Date(ymd + "T12:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export interface TemplateLike {
  frequency_kind?: string | null;
  interval_miles?: number | null;
  interval_miles_max?: number | null;
  interval_months?: number | null;
}

export interface ScheduleTargets {
  next_due_miles: number | null;
  next_due_miles_max: number | null;
  next_due_date: string | null;
  schedule_status: "active" | "fulfilled";
}

function parseKind(t: TemplateLike): FrequencyKind {
  const k = String(t.frequency_kind ?? "recurring").trim();
  if (k === "once_milestone" || k === "manual_only" || k === "recurring") return k;
  return "recurring";
}

function hasAnyInterval(t: TemplateLike): boolean {
  const im = t.interval_miles != null && Number.isFinite(Number(t.interval_miles));
  const imo = t.interval_months != null && Number.isFinite(Number(t.interval_months));
  return im || imo;
}

function nextOdoWindow(referenceOdo: number, t: TemplateLike): { next: number | null; nextMax: number | null } {
  const lo = t.interval_miles != null ? Number(t.interval_miles) : null;
  const hi = t.interval_miles_max != null ? Number(t.interval_miles_max) : null;
  const low = lo != null && Number.isFinite(lo) ? lo : null;
  const high = hi != null && Number.isFinite(hi) ? hi : null;
  if (low == null) return { next: null, nextMax: null };
  const next = referenceOdo + low;
  if (high != null && high > low) {
    return { next, nextMax: referenceOdo + high };
  }
  return { next, nextMax: null };
}

export function computeInitialScheduleRow(
  template: TemplateLike,
  baselineOdo: number,
  baselineDate: string,
): ({ ok: true } & ScheduleTargets) | { ok: false; reason: string } {
  const kind = parseKind(template);
  const intMo = template.interval_months != null ? Number(template.interval_months) : null;

  if (kind === "manual_only") {
    return {
      ok: true,
      next_due_miles: null,
      next_due_miles_max: null,
      next_due_date: null,
      schedule_status: "active",
    };
  }

  if (kind === "once_milestone") {
    if (!hasAnyInterval(template)) {
      return {
        ok: false,
        reason: "once_milestone tasks need at least one of interval miles or interval months",
      };
    }
    const { next: nextMiles, nextMax: nextMilesMax } = nextOdoWindow(baselineOdo, template);
    const nextDate = intMo != null && Number.isFinite(intMo) ? addMonthsIso(baselineDate, intMo) : null;
    return {
      ok: true,
      next_due_miles: nextMiles,
      next_due_miles_max: nextMilesMax,
      next_due_date: nextDate,
      schedule_status: "active",
    };
  }

  const { next: nextMiles, nextMax: nextMilesMax } = nextOdoWindow(baselineOdo, template);
  const nextDate = intMo != null && Number.isFinite(intMo) ? addMonthsIso(baselineDate, intMo) : null;
  return {
    ok: true,
    next_due_miles: nextMiles,
    next_due_miles_max: nextMilesMax,
    next_due_date: nextDate,
    schedule_status: "active",
  };
}

export function advanceAfterService(
  template: TemplateLike,
  performedOdo: number,
  performedDate: string,
): ScheduleTargets {
  const kind = parseKind(template);

  if (kind === "manual_only") {
    return {
      next_due_miles: null,
      next_due_miles_max: null,
      next_due_date: null,
      schedule_status: "active",
    };
  }

  if (kind === "once_milestone") {
    return {
      next_due_miles: null,
      next_due_miles_max: null,
      next_due_date: null,
      schedule_status: "fulfilled",
    };
  }

  const intMo = template.interval_months != null ? Number(template.interval_months) : null;
  const { next: nextMiles, nextMax: nextMilesMax } = nextOdoWindow(performedOdo, template);
  const nextDate = intMo != null && Number.isFinite(intMo) ? addMonthsIso(performedDate, intMo) : null;
  return {
    next_due_miles: nextMiles,
    next_due_miles_max: nextMilesMax,
    next_due_date: nextDate,
    schedule_status: "active",
  };
}