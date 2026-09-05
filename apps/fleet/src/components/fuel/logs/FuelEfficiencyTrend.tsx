import React, { useMemo } from 'react';
import type { FuelCycle } from '../../../types/fuel';

/**
 * Minimal km/L sparkline over a set of cycles (chronological by end date).
 * Pure SVG polyline — no chart lib. Presentational only.
 * Outlier callout when adjacent trusted cycles swing >50% in efficiency.
 */

export type FuelEfficiencyTrendProps = {
  cycles: FuelCycle[];
  width?: number;
  height?: number;
  className?: string;
};

const SWING_THRESHOLD = 0.5; // 50%

export function FuelEfficiencyTrend({
  cycles,
  width = 160,
  height = 40,
  className,
}: FuelEfficiencyTrendProps) {
  const { points, outlierNote } = useMemo(() => {
    const series = [...cycles]
      .filter((c) => typeof c.efficiency === 'number' && c.efficiency > 0)
      .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));

    const values = series.map((c) => c.efficiency as number);
    if (values.length < 2) return { points: null as string | null, outlierNote: null as string | null };

    let outlierNote: string | null = null;
    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1];
      const curr = values[i];
      if (prev <= 0) continue;
      const swing = Math.abs(curr - prev) / prev;
      if (swing > SWING_THRESHOLD) {
        const pct = Math.round(swing * 100);
        outlierNote = `Efficiency swung ${pct}% between adjacent Full Tanks (${prev.toFixed(1)} → ${curr.toFixed(1)} km/L).`;
        break;
      }
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = width / (values.length - 1);
    const pad = 2;

    const points = values
      .map((val, i) => {
        const x = i * stepX;
        const y = pad + (height - pad * 2) * (1 - (val - min) / span);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    return { points, outlierNote };
  }, [cycles, width, height]);

  if (!points) {
    return <span className={`text-xs text-slate-400 ${className || ''}`}>Not enough data</span>;
  }

  return (
    <div className={className}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Fuel efficiency trend"
      >
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-500"
        />
      </svg>
      {outlierNote && (
        <p className="mt-1.5 max-w-md text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {outlierNote}
        </p>
      )}
    </div>
  );
}

export default FuelEfficiencyTrend;
