import React from 'react';
import { Signal, SignalLow, SignalZero } from 'lucide-react';
import { GPS_ACCURACY, getAccuracyLevel, type AccuracyLevel } from '@/services/locationService';

type Props = {
  accuracyMeters: number | null;
  className?: string;
};

const CONFIG: Record<
  AccuracyLevel,
  { label: string; hint: string; bg: string; text: string; icon: typeof Signal }
> = {
  precise: {
    label: 'Precise',
    hint: 'GPS signal is strong',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    icon: Signal,
  },
  approximate: {
    label: 'Approximate',
    hint: 'Drag pin to adjust',
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    icon: SignalLow,
  },
  poor: {
    label: 'Weak signal',
    hint: 'Move outside or adjust pin',
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    icon: SignalZero,
  },
};

export function GpsAccuracyBadge({ accuracyMeters, className = '' }: Props) {
  if (accuracyMeters == null) return null;

  const level = getAccuracyLevel(accuracyMeters);
  const { label, hint, bg, text, icon: Icon } = CONFIG[level];

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium ${bg} ${text} ${className}`}
      title={`Accuracy: ~${Math.round(accuracyMeters)}m`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{label}</span>
      {level !== 'precise' && (
        <span className="opacity-70 font-normal">· {hint}</span>
      )}
    </div>
  );
}

export function AccuracyMeterDisplay({ accuracyMeters }: { accuracyMeters: number | null }) {
  if (accuracyMeters == null) return null;

  const level = getAccuracyLevel(accuracyMeters);
  const percentage = Math.max(
    0,
    Math.min(100, 100 - (accuracyMeters / GPS_ACCURACY.POOR) * 100),
  );

  const barColor =
    level === 'precise'
      ? 'bg-emerald-500'
      : level === 'approximate'
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 tabular-nums w-12 text-right">
        ~{Math.round(accuracyMeters)}m
      </span>
    </div>
  );
}
