import { formatDistanceToNow } from "date-fns";
import type { StationListRow } from "./stationRegisterApi";

export function relativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(2);
}

export function issueLabels(row: StationListRow) {
  const labels: string[] = [];
  if (row.possible_duplicate) labels.push("Possible duplicate");
  if (row.no_brand) labels.push("No brand");
  if (row.parish_text_mismatch) labels.push("Parish text mismatch");
  if (row.pin_unchecked) labels.push("Pin unchecked");
  if (row.company_style_name) labels.push("Company-style name");
  if (row.not_verified) labels.push("Not verified");
  return labels;
}

export function statusLabel(status: string) {
  if (status === "verified") return "Verified";
  if (status === "pending") return "Pending";
  if (status === "duplicate") return "Duplicate";
  if (status === "closed") return "Closed";
  return status;
}

export function pinLabel(pin: string) {
  if (pin === "confirmed") return "Confirmed";
  if (pin === "offset") return "Offset";
  return "Unchecked";
}

export function brandTone(name: string | null | undefined) {
  const key = (name || "").toLowerCase();
  if (key.includes("total")) return { wrap: "bg-rose-50 border-rose-200 text-rose-800", dot: "bg-rose-600" };
  if (key.includes("rubis")) return { wrap: "bg-blue-50 border-blue-200 text-blue-800", dot: "bg-blue-600" };
  if (key.includes("fesco")) return { wrap: "bg-emerald-50 border-emerald-200 text-emerald-800", dot: "bg-emerald-600" };
  if (key.includes("texaco")) return { wrap: "bg-red-50 border-red-200 text-red-800", dot: "bg-red-600" };
  if (key.includes("cool") || key.includes("oasis")) return { wrap: "bg-cyan-50 border-cyan-200 text-cyan-800", dot: "bg-cyan-500" };
  if (key.includes("petcom")) return { wrap: "bg-amber-50 border-amber-200 text-amber-800", dot: "bg-amber-500" };
  if (key.includes("unipet")) return { wrap: "bg-orange-50 border-orange-200 text-orange-800", dot: "bg-orange-500" };
  if (key.includes("blaize")) return { wrap: "bg-indigo-50 border-indigo-200 text-indigo-800", dot: "bg-indigo-600" };
  if (key.includes("gulf")) return { wrap: "bg-sky-50 border-sky-200 text-sky-800", dot: "bg-sky-600" };
  return { wrap: "bg-slate-50 border-slate-200 text-slate-700", dot: "bg-slate-500" };
}

export function issueChipClass(label: string) {
  if (label === "Possible duplicate") return "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300";
  if (label === "No brand") return "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium";
  if (label === "Parish text mismatch") return "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 border border-purple-200 font-medium";
  if (label === "Company-style name") return "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200 font-medium";
  return "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200";
}
