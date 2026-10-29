import { narrativeSentence, gradeLabel } from "./stationAnalyticsFormat";
import type { StationAnalytics } from "./stationAnalyticsApi";
import { useBenchmarkName } from "../refineries/useRefineries";

export function AnalyticsNarrative({ data }: { data: StationAnalytics }) {
  const benchmarkName = useBenchmarkName();
  const line = narrativeSentence({
    gradeLabel: gradeLabel(data.meta.grade),
    pumpMedian: data.kpis.pumpMedian,
    stations: data.kpis.nStations,
    reporters: data.trust.reporters,
    gap: data.kpis.pumpMedian != null && data.meta.petrojam != null ? data.kpis.pumpMedian - data.meta.petrojam : null,
    petrojam: data.meta.petrojam,
    lowName: data.kpis.min?.name ?? null,
    lowPrice: data.kpis.min?.price ?? null,
    benchmarkName,
  });
  if (!line) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100">
      <p>{line}</p>
    </div>
  );
}
