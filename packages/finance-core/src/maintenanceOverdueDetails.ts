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
  options?: { dueSoonKm?: number; dueSoonDays?: number },
): MaintenanceScheduleRowAnalysis {
  if (scheduleRowStatus === "fulfilled") {
    return { status: "fulfilled", calendarDaysOverdue: null, kmOverdue: null };
  }

  const dueSoonKm = options?.dueSoonKm ?? 1000;
  const dueSoonDays = options?.dueSoonDays ?? 14;

  let overdueMiles = false;
  let dueSoonMiles = false;
  if (nextMiles != null && Number.isFinite(Number(nextMiles))) {
    const nm = Number(nextMiles);
    overdueMiles = currentOdo >= nm;
    if (!overdueMiles && currentOdo > 0) {
      dueSoonMiles = currentOdo >= Math.max(0, nm - dueSoonKm) && currentOdo < nm;
    }
  }

  const overdueDate = nextDate != null && today > nextDate;
  let dueSoonDate = false;
  if (nextDate != null && !overdueDate) {
    const dueSoonStart = new Date(nextDate + "T12:00:00Z");
    dueSoonStart.setUTCDate(dueSoonStart.getUTCDate() - dueSoonDays);
    const startYmd = dueSoonStart.toISOString().slice(0, 10);
    dueSoonDate = today >= startYmd && today <= nextDate;
  }

  let status: MaintenanceScheduleRowAnalysis["status"];
  if (overdueMiles || overdueDate) status = "overdue";
  else if (dueSoonMiles || dueSoonDate) status = "pending";
  else status = "ok";

  let calendarDaysOverdue: number | null = null;
  let kmOverdue: number | null = null;

  if (status === "overdue") {
    if (overdueDate && nextDate) {
      calendarDaysOverdue = diffCalendarDaysUtc(nextDate, today);
    }
    if (overdueMiles && nextMiles != null && Number.isFinite(Number(nextMiles))) {
      const nm = Number(nextMiles);
      kmOverdue = Math.max(0, currentOdo - nm);
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

export interface MaintenanceDueRowPick {
  category_name?: string | null;
  due_status?: string | null;
  km_overdue?: number | null;
  days_overdue?: number | null;
}

/** Pick the single worst due row for fleet status / next-due copy (R-04 / R-05a). */
export function pickWorstMaintenanceDueRow<T extends MaintenanceDueRowPick>(
  rows: T[],
): T | null {
  const eligible = rows.filter((r) => {
    const st = String(r.due_status ?? "");
    return st === "overdue" || st === "due_soon";
  });
  if (!eligible.length) return null;
  return [...eligible].sort((a, b) => {
    const kmA = Number(a.km_overdue ?? 0);
    const kmB = Number(b.km_overdue ?? 0);
    if (kmB !== kmA) return kmB - kmA;
    const dayA = Number(a.days_overdue ?? 0);
    const dayB = Number(b.days_overdue ?? 0);
    return dayB - dayA;
  })[0];
}

export function formatWorstDueSummary(row: MaintenanceDueRowPick | null): string | null {
  if (!row || !row.category_name) return null;
  const name = String(row.category_name);
  if (row.due_status === "overdue") {
    const km = Number(row.km_overdue ?? 0);
    if (km > 0) return `${name} — overdue ${km.toLocaleString()} km`;
    const days = Number(row.days_overdue ?? 0);
    if (days > 0) return `${name} — overdue ${days} days`;
    return `${name} — overdue`;
  }
  if (row.due_status === "due_soon") {
    return `${name} — due soon`;
  }
  return name;
}