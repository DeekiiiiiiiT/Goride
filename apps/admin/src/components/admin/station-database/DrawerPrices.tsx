import type { StationDetail } from "./stationRegisterApi";
import { money, relativeTime } from "./stationFormat";

const GRADES = ["e10_87", "e10_90", "diesel", "ulsd"];

export function DrawerPrices({ detail, onOpenEngine }: { detail?: StationDetail; onOpenEngine: () => void }) {
  const byGrade = new Map((detail?.prices || []).map((price) => [price.grade, price]));
  const wholesale = detail?.wholesaleE10;
  return (
    <div className="flex flex-col gap-2 text-xs">
      {GRADES.map((grade) => {
        const price = byGrade.get(grade);
        const gap = price && wholesale != null && grade === "e10_87" ? Number(price.price_per_litre) - Number(wholesale) : null;
        return (
          <div key={grade} className="border border-slate-200 rounded-xl px-3 py-2">
            <div className="font-bold text-slate-900">{grade}</div>
            <div className="font-mono">{price ? <>J${money(price.price_per_litre)}</> : "—"}</div>
            <div className="text-slate-500">Gap above Petrojam: {gap == null ? "—" : `${gap >= 0 ? "+" : ""}${gap.toFixed(2)}`}</div>
            <div className="text-slate-500">Confidence: {price?.confidence || "—"} · Reports: {price?.report_count ?? "—"} · {relativeTime(price?.last_report_at || price?.observed_at)}</div>
            {price?.outdated ? <div className="text-amber-700 font-bold">Outdated</div> : null}
          </div>
        );
      })}
      <button type="button" className="text-blue-600 font-bold text-left" onClick={onOpenEngine}>Open in Price Engine</button>
    </div>
  );
}
