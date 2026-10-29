import type { StationDetail, StationListRow } from "./stationRegisterApi";
import { relativeTime } from "./stationFormat";

export function DrawerHistory({ detail, row }: { detail?: StationDetail; row: StationListRow }) {
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Immutable Log</div>
      <div className="text-slate-600">{row.fill_count || 0} fills · last {relativeTime(row.last_fill_at)}</div>
      {(detail?.history || []).map((entry, index) => (
        <div key={`${entry.created_at}-${index}`} className="border-b border-slate-100 pb-2">
          <div className="font-bold text-slate-900">{entry.action} · {entry.reason || "updated"}</div>
          <div className="text-slate-500">{entry.actor || "Unknown"} · {relativeTime(entry.created_at)}</div>
        </div>
      ))}
      {(detail?.evidence || []).map((entry) => (
        <div key={entry.id} className="text-slate-600">{entry.note || "Evidence"} · {entry.origin_app || "plug"} · {relativeTime(entry.created_at)}</div>
      ))}
      {!(detail?.history || []).length && !(detail?.evidence || []).length ? <div className="text-slate-500">No changes recorded yet.</div> : null}
    </div>
  );
}
