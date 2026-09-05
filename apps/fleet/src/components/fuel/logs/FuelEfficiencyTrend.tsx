import React, { useMemo } from 'react';
import type { FuelCycle } from '../../../types/fuel';

/**
 * Minimal km/L sparkline over a set of cycles (chronological by end date).
 * Pure SVG polyline — no chart lib. Presentational only.
 */

export type FuelEfficiencyTrendProps = {
  cycles: FuelCycle[];
  width?: number;
  height?: number;
  className?: string;
};

export function FuelEfficiencyTrend({
  cycles,
  width = 160,
  height = 40,
  className,
}: FuelEfficiencyTrendProps) {
  const points = useMemo(() => {
    const series = [...cycles]
      .filter((c) => typeof c.efficiency === 'number' && c.efficiency > 0)
      .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)))
      .map((c) => c.efficiency);

    if (series.length < 2) return null;

    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    const stepX = width / (series.length - 1);
    const pad = 2;

    return series
      .map((val, i) => {
        const x = i * stepX;
        // Invert Y so higher efficiency sits near the top.
        const y = pad + (height - pad * 2) * (1 - (val - min) / span);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [cycles, width, height]);

  if (!points) {
    return <span className={`text-xs text-slate-400 ${className || ''}`}>Not enough data</span>;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
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
  );
}

export default FuelEfficiencyTrend;
