import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BoardProduct, SeriesPoint } from "./refineriesApi";
import { PRODUCT_COLORS, formatJmd, formatWeek } from "./refineryFormat";

const RANGES = ["12w", "26w", "52w", "5y", "All"] as const;
export type TrendRange = (typeof RANGES)[number];

export function rangeStart(range: TrendRange, latest: string | null): string | null {
  if (range === "All" || !latest) return null;
  const days = range === "12w" ? 84 : range === "26w" ? 182 : range === "52w" ? 364 : 365 * 5;
  const date = new Date(`${latest.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function RefineryTrendChart({
  products,
  points,
  range,
  refineryName,
  canCompare,
  compare,
  onRange,
  onProducts,
  onCompare,
}: {
  products: BoardProduct[];
  points: SeriesPoint[];
  range: TrendRange;
  refineryName: string;
  canCompare: boolean;
  compare: boolean;
  onRange: (range: TrendRange) => void;
  onProducts: (codes: string[]) => void;
  onCompare: (on: boolean) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const selected = products.filter((product) => product.boardGroup === "motor").map((product) => product.code);
  const active = useMemo(() => {
    const fromPoints = new Set<string>();
    for (const point of points) for (const item of point.products || []) fromPoints.add(item.code);
    return fromPoints.size ? [...fromPoints] : selected;
  }, [points, selected]);

  const rows = points.map((point) => {
    const row: Record<string, string | number | null> = { week: point.week.slice(0, 10) };
    for (const item of point.products || []) row[item.code] = item.price;
    if (point.refinery) row[point.refinery] = point.price ?? null;
    return row;
  });
  const hoverPoint = points.find((point) => point.week.slice(0, 10) === hover) || points.at(-1);

  function toggle(code: string) {
    const next = active.includes(code) ? active.filter((item) => item !== code) : [...active, code];
    if (next.length > 5) return;
    onProducts(next);
  }

  return (
    <div className="lg:col-span-8 bg-surface-container-lowest border border-surface-variant/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-on-surface">Price trend</h3>
          <div className="inline-flex p-0.5 rounded-lg bg-surface-container text-xs font-mono-code">
            {RANGES.map((item) => (
              <button key={item} type="button" className={`px-2.5 py-1 rounded ${item === range ? "bg-surface-container-lowest text-on-surface font-semibold shadow-xs" : "text-outline hover:text-on-surface"}`} onClick={() => onRange(item)}>{item}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-1">
          {products.map((product) => {
            const on = active.includes(product.code);
            return (
              <button key={product.code} type="button" onClick={() => toggle(product.code)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${on ? "font-medium bg-surface-container-low text-on-surface border border-secondary/30" : "font-normal text-outline hover:bg-surface-container"}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: on ? PRODUCT_COLORS[product.code] : "#b0b1bc" }} /> {product.label}
              </button>
            );
          })}
        </div>
        <div className="relative mt-6 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} onMouseMove={(state) => setHover(state?.activeLabel ? String(state.activeLabel) : null)}>
              <CartesianGrid stroke="rgba(225,226,237,0.4)" vertical={false} />
              <XAxis
                dataKey="week"
                interval={rows.length > 40 ? Math.ceil(rows.length / 6) : "preserveStartEnd"}
                tickFormatter={(value) => formatWeek(String(value), range === "All" || range === "5y")}
                tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }}
              />
              <YAxis tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} width={40} />
              <Tooltip content={() => null} />
              {active.map((code) => (
                <Line key={code} type="monotone" dataKey={code} stroke={PRODUCT_COLORS[code] || "#64748b"} strokeWidth={1.8} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {hoverPoint ? (
            <div className="absolute right-4 top-2 bg-surface-container-lowest/95 backdrop-blur-sm border border-surface-variant p-3 rounded-lg shadow-md font-mono-code text-[11px] z-10 w-56 pointer-events-none">
              <div className="font-medium text-on-surface border-b border-surface-variant/60 pb-1.5 mb-1.5 flex justify-between">
                <span>Week {formatWeek(hoverPoint.week)}</span>
                <span className="text-outline">{refineryName}</span>
              </div>
              {(hoverPoint.products || []).map((item) => (
                <div key={item.code} className="flex items-center justify-between" style={{ color: PRODUCT_COLORS[item.code] }}>
                  <span>{products.find((product) => product.code === item.code)?.label}:</span>
                  <span className="tabular-nums font-semibold">{formatJmd(item.price, 2)} {item.change != null ? <span className="text-[10px] font-normal text-outline">{item.change < 0 ? "▼" : "▲"}{Math.abs(item.change).toFixed(2)}</span> : null}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="a11y-table">
        <table>
          <caption>Price trend</caption>
          <thead><tr><th>Week</th>{active.map((code) => <th key={code}>{products.find((product) => product.code === code)?.label}</th>)}</tr></thead>
          <tbody>
            {rows.slice(-8).map((row) => (
              <tr key={String(row.week)}>{Object.values(row).map((value, index) => <td key={index}>{value}</td>)}</tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <div className="mt-6 pt-4 border-t border-surface-container flex items-center justify-between">
        <span className="text-xs text-outline">Ex-refinery billing standard</span>
        <div className="flex items-center gap-2">
          {!canCompare ? <span className="text-[11px] text-outline">Add a second refinery to compare</span> : null}
          <button type="button" disabled={!canCompare} aria-pressed={compare} className="w-8 h-4 bg-surface-container-high rounded-full relative disabled:cursor-not-allowed disabled:opacity-60" onClick={() => canCompare && onCompare(!compare)}>
            <span className={`w-3 h-3 bg-white rounded-full absolute top-0.5 shadow-xs ${compare ? "right-0.5" : "left-0.5"}`} />
          </button>
          <span className="text-xs text-outline font-medium">Compare refineries</span>
        </div>
      </div>
    </div>
  );
}
