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
      .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));

    const values = series.map((c) => c.efficiency as number);
    if (values.length < 2) return null as string | null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = width / (values.length - 1);
    const pad = 2;

    return values
      .map((val, i) => {
        const x = i * stepX;
        const y = pad + (height - pad * 2) * (1 - (val - min) / span);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [cycles, width, height]);

  if (!points) {
    return <span className={`text-[13px] text-[#47464c] ${className || ''}`}>Needs two or more full tanks to draw.</span>;
  }

  return (
    <div className={className}>
      <svg
        width="100%"
        height={height}
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Fuel efficiency trend"
      >
        <polygon points={`0,${height} ${points} ${width},${height}`} className="fill-[#069669]/10" />
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[#069669]"
        />
      </svg>
    </div>
  );
}

export default FuelEfficiencyTrend;
