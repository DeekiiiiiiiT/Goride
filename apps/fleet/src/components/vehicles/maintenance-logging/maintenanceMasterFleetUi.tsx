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
};

export function mmSourceLabel(source?: string | null): string {
  if (source === "maker_manual") return "Car maker";
  if (source === "part_maker") return "Part maker";
  return "Roam policy";
}

export function mmFormatCustomInterval(row: MmDueRow): string {
  const parts: string[] = [];
  if (row.custom_interval_km != null) parts.push(`${Number(row.custom_interval_km).toLocaleString()} km`);
  if (row.custom_interval_months != null) parts.push(`${row.custom_interval_months} months`);
  if (!parts.length) return "—";
  return parts.join(" or ");
}

export function mmFormatDueLine(row: MmDueRow): string {
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
