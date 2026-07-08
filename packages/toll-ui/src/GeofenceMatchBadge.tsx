import type { GeofenceMatchStatus } from '@roam/types/tollCrossings';
import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import React from 'react';

const CONFIG: Record<
  GeofenceMatchStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  confirmed: {
    label: 'Geofence confirmed',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    Icon: CheckCircle2,
  },
  none: {
    label: 'No crossing logged',
    className: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    Icon: HelpCircle,
  },
  mismatch: {
    label: 'Mismatch',
    className: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
    Icon: AlertTriangle,
  },
};

export interface GeofenceMatchBadgeProps {
  status: GeofenceMatchStatus;
  className?: string;
}

export function GeofenceMatchBadge({ status, className = '' }: GeofenceMatchBadgeProps) {
  const { label, className: tone, Icon } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}
