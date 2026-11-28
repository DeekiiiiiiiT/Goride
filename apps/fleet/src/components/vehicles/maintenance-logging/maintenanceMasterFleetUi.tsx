import React from "react";

export type MmDueRow = {
  category_name?: string;
  category_code?: string;
  category_id?: string;
  position?: string | null;
  due_status?: string;
  km_overdue?: number | null;
  days_overdue?: number | null;
  next_due_km?: number | null;
  projected_due_date?: string | null;
  current_odometer?: number | null;
  source_type?: string | null;
  interval_sentence?: string | null;
  needs_checking?: boolean;
  custom_interval_km?: number | null;
  custom_interval_months?: number | null;
  custom_reason?: string | null;
  updated_by_roam_at?: string | null;
  odometer_needed?: boolean;
  severe_duty?: boolean;
  schedule_status?: string | null;
  /** Step 10: why the engine stopped scheduling this part (MER-18). */
  retired_reason?: string | null;
  /** Step 10: the printed page of the car maker's document the rule came from. */
  source_page?: { page: number; doc: "owners_manual" | "schedule" } | null;
  counting_from_km?: number | null;
  counting_from_date?: string | null;
  counting_from_source?: "service" | "filled_in" | "first_reading" | null;
};

export function mmSourceLabel(source?: string | null): string {
  if (source === "maker_manual") return "Car maker";
  if (source === "part_maker") return "Part maker";
  return "Roam policy";
}

/**
 * Step 10 (B5): where the number comes from, in one line — "Car maker · page 412", "Fleet override — reason",
 * or "Roam policy — no manual yet".
 */
export function mmSourceText(row: MmDueRow): string {
  if (row.custom_interval_km != null || row.custom_interval_months != null) {
    return row.custom_reason ? `Fleet override — ${row.custom_reason}` : "Fleet override";
  }
  if (row.source_type === "maker_manual" || row.source_type === "part_maker") {
    const who = mmSourceLabel(row.source_type);
    return row.source_page ? `${who} · page ${row.source_page.page}` : who;
  }
  return "Roam policy — no manual yet";
}

function shortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Step 10: where the clock started — "Counted from your service on 22 Aug 2026 at 180,088 km". Null when unknown. */
export function mmCountingFromText(row: MmDueRow): string | null {
  if (!row.counting_from_source) return null;
  const date = row.counting_from_date ? ` on ${shortDate(row.counting_from_date)}` : "";
  const km = row.counting_from_km != null ? ` at ${Number(row.counting_from_km).toLocaleString("en-US")} km` : "";
  if (row.counting_from_source === "service") return `Counted from your service${date}${km}`;
  if (row.counting_from_source === "filled_in") return `Counted from the history you filled in${date}${km}`;
  return `Counted from the first odometer reading${date}${km}`;
}

/** Step 10: the overdue amount in red on the line — "10,844 km overdue" or "12 days overdue". */
export function mmOverdueText(row: MmDueRow): string | null {
  if (row.due_status !== "overdue") return null;
  if (row.km_overdue != null && Number(row.km_overdue) > 0) return `${Number(row.km_overdue).toLocaleString("en-US")} km overdue`;
  if (row.days_overdue != null && Number(row.days_overdue) > 0) {
    const d = Number(row.days_overdue);
    return `${d} day${d === 1 ? "" : "s"} overdue`;
  }
  return "Overdue";
}

/** Step 10: a line can be logged from the drawer when it needs doing (never on OK or retired lines, Round 2). */
export function mmCanLogThis(row: MmDueRow): boolean {
  if (row.schedule_status === "retired") return false;
  return row.due_status === "overdue" || row.due_status === "due_soon" || row.due_status === "history_unknown";
}

export function mmFormatCustomInterval(row: MmDueRow): string {
  const parts: string[] = [];
  if (row.custom_interval_km != null) parts.push(`${Number(row.custom_interval_km).toLocaleString()} km`);
  if (row.custom_interval_months != null) parts.push(`${row.custom_interval_months} months`);
  if (!parts.length) return "—";
  return parts.join(" or ");
}

export function mmFormatDueLine(row: MmDueRow): string {
  if (row.due_status === "history_unknown") return "Last done: not known · Check at next service";
  if (row.due_status === "no_rule") return "No schedule set for this part yet";
  const km = row.next_due_km;
  const date = row.projected_due_date ? String(row.projected_due_date).slice(0, 10) : null;
  if (row.odometer_needed || row.due_status === "odometer_needed") {
    return date ? `Due by ${date}` : "Waiting for odometer";
  }
  const kmPart = km != null ? `Due at ${Number(km).toLocaleString()} km` : null;
  const datePart = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  if (kmPart && datePart) return `${kmPart} or ${datePart} · whichever first`;
  return kmPart || (datePart ? `Due by ${datePart}` : "—");
}

export function mmStatusLabel(status?: string): string {
  if (status === "overdue") return "Overdue";
  if (status === "due_soon") return "Due soon";
  if (status === "history_unknown") return "History unknown";
  if (status === "no_rule") return "No schedule";
  return "OK";
}

export function MmSourceChip({ source }: { source?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-800">
      {mmSourceLabel(source)}
    </span>
  );
}

export function MmDueStatusChip({ status }: { status?: string }) {
  const label = mmStatusLabel(status);
  const cls =
    status === "overdue"
      ? "border-red-200 bg-red-50 text-red-800"
      : status === "due_soon"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : status === "history_unknown"
          ? "border-violet-200 bg-violet-50 text-violet-800"
          : status === "no_rule"
            ? "border-slate-300 bg-slate-50 text-slate-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
  );
}

export function MmMetaChip({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "indigo" | "amber" }) {
  const map = {
    slate: "border-slate-300 bg-slate-100 text-slate-700",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[tone]}`}>{children}</span>
  );
}
