/**
 * Tiny SVG sparkline — shared by vehicle analytics KPIs and fuel recon landing.
 */
import React from 'react';

export function Sparkline({
  values,
  stroke,
  className = 'h-9 w-20 shrink-0',
}: {
  values: number[];
  stroke: string;
  className?: string;
}) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${36 - ((v - min) / range) * 32}`)
    .join(' ');
  return (
    <svg
      className={className}
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
