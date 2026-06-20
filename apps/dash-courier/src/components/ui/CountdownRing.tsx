import React from 'react';

const CIRCUMFERENCE = 283;

type CountdownRingProps = {
  seconds: number;
  totalSeconds: number;
  size?: 'sm' | 'lg';
  label?: string;
  color?: string;
};

export function CountdownRing({
  seconds,
  totalSeconds,
  size = 'lg',
  label = 'sec',
  color = '#22C55E',
}: CountdownRingProps) {
  const progress = totalSeconds > 0 ? seconds / totalSeconds : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const dim = size === 'lg' ? 'w-48 h-48' : 'w-24 h-24';
  const textSize = size === 'lg' ? 'text-[28px] leading-9' : 'text-xl';

  return (
    <div className={`relative flex items-center justify-center ${dim}`}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="45" fill="none" stroke="#eee7e3" strokeWidth={size === 'lg' ? 6 : 8} />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={color}
          strokeWidth={size === 'lg' ? 6 : 8}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`${textSize} font-bold text-primary`}>{seconds}</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</span>
      </div>
    </div>
  );
}
