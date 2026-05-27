import React from 'react';
import { Signal, SignalLow, SignalZero } from 'lucide-react';

type Props = {
  accuracyMeters: number | null;
  className?: string;
};

function level(accuracyMeters: number): 'precise' | 'approximate' | 'poor' {
  if (accuracyMeters <= 25) return 'precise';
  if (accuracyMeters <= 75) return 'approximate';
  return 'poor';
}

const CONFIG = {
  precise: { label: 'GPS strong', icon: Signal, className: 'text-emerald-600' },
  approximate: { label: 'GPS OK', icon: SignalLow, className: 'text-amber-600' },
  poor: { label: 'Weak GPS', icon: SignalZero, className: 'text-red-600' },
} as const;

export function DriverGpsBadge({ accuracyMeters, className = '' }: Props) {
  if (accuracyMeters == null) return null;
  const lv = level(accuracyMeters);
  const { label, icon: Icon, className: color } = CONFIG[lv];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${color} ${className}`}
      title={`Accuracy ~${Math.round(accuracyMeters)}m`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {label}
    </span>
  );
}
