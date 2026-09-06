/**
 * Schedule row analysis: same rules as maintenance edge routes, plus overdue metrics for fleet UX.
 */

export const FLEET_SERVICES_ATTENTION_CAP = 10;

/** Valid upper window bound: must be strictly greater than next_due_miles. */
export function normalizeNextMilesMax(
  nextMiles: number | null,
  nextMilesMaxRaw: number | null | undefined,
): number | null {
  if (nextMiles == null || nextMilesMaxRaw == null) return null;
  const lo = Number(nextMiles);
  const hi = Number(nextMilesMaxRaw);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (hi <= lo) return null;
  return hi;
}

/** Full calendar days from fromYmd (inclusive) to toYmd (exclusive of from anchor); both YYYY-MM-DD UTC. */
export function diffCalendarDaysUtc(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(
    Number(fromYmd.slice(0, 4)),
    Number(fromYmd.slice(5, 7)) - 1,
    Number(fromYmd.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toYmd.slice(0, 4)),
    Number(toYmd.slice(5, 7)) - 1,
    Number(toYmd.slice(8, 10)),
  );
  return Math.floor((b - a) / 86400000);
}

export interface MaintenanceScheduleRowAnalysis {
  status: "ok" | "pending" | "overdue" | "fulfilled";
  /** Past next_due_date when status is overdue and date applies. */
  calendarDaysOverdue: number | null;
  /** Past mileage window end when status is overdue and miles apply. */
  kmOverdue: number | null;
}

export function analyzeMaintenanceScheduleRow(
  currentOdo: number,
  today: string,
  nextMiles: number | null,
  nextMilesMaxRaw: number | null | undefined,
  nextDate: string | null,
  scheduleRowStatus?: string | null,
): MaintenanceScheduleRowAnalysis {
  if (scheduleRowStatus === "fulfilled") {
    return { status: "fulfilled", calendarDaysOverdue: null, kmOverdue: null };
  }

  const maxM = normalizeNextMilesMax(nextMiles, nextMilesMaxRaw);

  let overdueMiles = false;
  let milesDueOrInWindow = false;
  if (nextMiles != null && Number.isFinite(Number(nextMiles))) {
    const nm = Number(nextMiles);
    if (maxM != null) {
      overdueMiles = currentOdo > maxM;
      milesDueOrInWindow = currentOdo >= nm && currentOdo <= maxM;
    } else {
      overdueMiles = currentOdo > nm;
      milesDueOrInWindow = currentOdo >= nm;
    }
  }

  const overdueDate = nextDate != null && today > nextDate;
  const dueDate = nextDate != null && today >= nextDate;

  let status: MaintenanceScheduleRowAnalysis["status"];
  if (overdueMiles || overdueDate) status = "overdue";
  else if (milesDueOrInWindow || dueDate) status = "pending";
  else status = "ok";

  let calendarDaysOverdue: number | null = null;
  let kmOverdue: number | null = null;

  if (status === "overdue") {
    if (overdueDate && nextDate) {
      calendarDaysOverdue = diffCalendarDaysUtc(nextDate, today);
    }
    if (overdueMiles && nextMiles != null && Number.isFinite(Number(nextMiles))) {
      const nm = Number(nextMiles);
      if (maxM != null) {
        kmOverdue = Math.max(0, currentOdo - maxM);
      } else {
        kmOverdue = Math.max(0, currentOdo - nm);
      }
    }
  }

  return { status, calendarDaysOverdue, kmOverdue };
}

export function computeScheduleRowStatus(
  currentOdo: number,
  today: string,
  nextMiles: number | null,
  nextMilesMaxRaw: number | null | undefined,
  nextDate: string | null,
  scheduleRowStatus?: string | null,
): MaintenanceScheduleRowAnalysis["status"] {
  return analyzeMaintenanceScheduleRow(
    currentOdo,
    today,
    nextMiles,
    nextMilesMaxRaw,
    nextDate,
    scheduleRowStatus,
  ).status;
}

export type FleetServiceAttentionKind = "overdue" | "due_soon";

export interface FleetServiceAttentionItem {
  taskName: string;
  kind: FleetServiceAttentionKind;
}

export function sortFleetServiceAttention(
  items: FleetServiceAttentionItem[],
): FleetServiceAttentionItem[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "overdue" ? -1 : 1;
    return a.taskName.localeCompare(b.taskName, undefined, { sensitivity: "base" });
  });
}