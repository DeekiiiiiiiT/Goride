import type { StationSummary } from "./stationRegisterApi";
import { StationIcon } from "./StationIcon";

const CHIPS = [
  { key: "verified", status: "verified", issue: "", label: "Verified" },
  { key: "pending", status: "pending", issue: "", label: "Pending" },
  { key: "duplicate", status: "", issue: "duplicate", label: "Possible duplicate" },
  { key: "no_brand", status: "", issue: "no_brand", label: "No brand" },
  { key: "parish", status: "", issue: "parish_mismatch", label: "Parish text mismatch" },
  { key: "pin", status: "", issue: "pin_unchecked", label: "Pin unchecked" },
] as const;

function restClass(key: string) {
  if (key === "no_brand") return "px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors font-semibold flex items-center gap-1";
  if (key === "parish") return "px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors font-semibold flex items-center gap-1";
  if (key === "pin") return "px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors font-medium border border-slate-200/60 flex items-center gap-1";
  return "px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors font-medium border border-slate-200/60";
}

function countClass(key: string, pressed: boolean) {
  if (pressed) return "bg-white/30 text-white rounded-full px-1.5 text-[10px] font-mono";
  if (key === "no_brand") return "bg-indigo-200/70 text-indigo-800 rounded-full px-1.5 text-[10px] font-mono";
  if (key === "parish") return "bg-purple-200/70 text-purple-800 rounded-full px-1.5 text-[10px] font-mono";
  if (key === "pin") return "bg-slate-200 text-slate-700 rounded-full px-1.5 text-[10px] font-mono";
  return "bg-slate-200 text-slate-700 rounded-full px-1.5 text-[10px] font-mono";
}

export function StationIssueChips({
  summary,
  status,
  issue,
  onPick,
}: {
  summary?: StationSummary;
  status: string;
  issue: string;
  onPick: (next: { status: string; issue: string }) => void;
}) {
  const count = (chip: (typeof CHIPS)[number]) => {
    if (!summary) return 0;
    if (chip.key === "verified") return summary.verified;
    if (chip.key === "pending") return summary.pending;
    if (chip.key === "duplicate") return summary.issues.duplicate;
    if (chip.key === "no_brand") return summary.issues.no_brand;
    if (chip.key === "parish") return summary.issues.parish_mismatch;
    return summary.issues.pin_unchecked;
  };
  return (
    <div className="px-4 py-2.5 bg-white border-b border-slate-200/80 flex items-center gap-2 overflow-x-auto whitespace-nowrap text-xs">
      <span className="text-[11px] font-label font-bold text-slate-400 uppercase tracking-wider mr-1">Quick Filters:</span>
      {CHIPS.map((chip) => {
        const pressed = chip.issue ? issue === chip.issue && !status : status === chip.status && !issue;
        const showCount = chip.key !== "verified" && chip.key !== "pending";
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={pressed}
            onClick={() => onPick(pressed ? { status: "", issue: "" } : { status: chip.status, issue: chip.issue })}
            className={pressed
              ? "px-3.5 py-1 rounded-full bg-amber-500 text-white font-bold shadow-sm shadow-amber-500/25 flex items-center gap-1.5 border border-amber-600"
              : restClass(chip.key)}
          >
            {chip.key === "duplicate" ? <StationIcon name="content_copy" className="text-[14px]" /> : null}
            <span>{chip.label}</span>
            {showCount || pressed ? <span className={countClass(chip.key, pressed)}>{count(chip)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
