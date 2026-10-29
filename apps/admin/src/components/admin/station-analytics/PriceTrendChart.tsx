import { useMemo, useState } from "react";
import { useBenchmarkName } from "../refineries/useRefineries";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatJmd, formatWeek } from "./stationAnalyticsFormat";
import type { StationAnalytics } from "./stationAnalyticsApi";

const RANGES = [
  { id: 12, label: "12w" },
  { id: 26, label: "26w" },
  { id: 52, label: "52w" },
  { id: 260, label: "5y" },
] as const;

export function PriceTrendChart({ data, phone }: { data: StationAnalytics; phone: boolean }) {
  const benchmarkName = useBenchmarkName();
  const [range, setRange] = useState(phone ? 12 : 26);
  const petroOnly = range === 260;
  const points = useMemo(() => data.trend.slice(-range), [data.trend, range]);
  const hasPump = points.some((point) => point.pumpMedian != null);
  const latest = [...data.trend].reverse().find((point) => point.petrojam != null);
  const prev = data.meta.petrojamPrev;
  const year = data.meta.petrojamYearAgo;
  const wow = latest?.petrojam != null && prev != null && prev !== 0
    ? ((latest.petrojam - prev) / prev) * 100
    : null;
  const yoy = latest?.petrojam != null && year != null && year !== 0
    ? ((latest.petrojam - year) / year) * 100
    : null;

  return (
    <section className="flex flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:col-span-12">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Price trend</h2>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-[11px] dark:border-slate-700" role="group" aria-label="Trend range">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-md px-2 py-1 font-mono ${range === item.id ? "bg-[#316bf3] text-white" : "text-slate-600 dark:text-slate-300"}`}
              aria-pressed={range === item.id}
              onClick={() => setRange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="week" tickFormatter={(value) => formatWeek(String(value)).replace(/ \d{4}$/, "")} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={48} domain={["auto", "auto"]} />
            <Tooltip
              formatter={(value, name) => [value == null ? "—" : formatJmd(Number(value)), name]}
              labelFormatter={(label) => formatWeek(String(label))}
            />
            <Legend />
            <Line type="monotone" dataKey="petrojam" name={benchmarkName} stroke="#64748b" dot={false} strokeWidth={2} connectNulls />
            {petroOnly ? null : (
              <Line type="monotone" dataKey="pumpMedian" name="Pump median" stroke="#316bf3" strokeWidth={2} connectNulls={false} dot={{ r: 3 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        {!hasPump || petroOnly ? "No pump reports in this range. " : null}
        {wow == null ? null : `${benchmarkName} ${wow < 0 ? "fell" : "rose"} ${Math.abs(wow).toFixed(1)}% this week. `}
        {yoy == null ? null : `It is ${yoy < 0 ? "down" : "up"} ${Math.abs(yoy).toFixed(1)}% on a year ago.`}
      </p>
      <table className="sr-only">
        <caption>Price trend numbers</caption>
        <thead>
          <tr><th>Week</th><th>{benchmarkName}</th><th>Pump median</th><th>Reports</th><th>Stations</th></tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.week}>
              <td>{point.week}</td>
              <td>{point.petrojam ?? "—"}</td>
              <td>{point.pumpMedian ?? "—"}</td>
              <td>{point.reports}</td>
              <td>{point.stations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
