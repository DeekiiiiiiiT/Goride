import type { TollCrossingDto, TollUiState } from '@roam/types/tollCrossings';
import { MapPin } from 'lucide-react';
import React from 'react';

function formatMinor(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export interface LiveTollBannerProps {
  variant?: 'rider' | 'driver';
  crossings?: TollCrossingDto[];
  totalMinor?: number;
  currency?: string;
  state?: TollUiState;
  className?: string;
}

export function LiveTollBanner({
  variant = 'rider',
  crossings = [],
  totalMinor = 0,
  currency = 'JMD',
  state = 'data',
  className = '',
}: LiveTollBannerProps) {
  if (state === 'loading') return null;
  if (state === 'empty' || totalMinor <= 0) return null;

  const latest = crossings[crossings.length - 1];
  const label =
    variant === 'driver'
      ? `Trip tolls: ${formatMinor(totalMinor, currency)}`
      : latest
        ? `Toll detected: ${latest.toll_plaza_name} — ${formatMinor(latest.toll_amount_minor, currency)}`
        : `Tolls on trip: ${formatMinor(totalMinor, currency)}`;

  return (
    <div
      role="status"
      className={`flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 ${className}`}
    >
      <MapPin className="h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{label}</p>
        {crossings.length > 1 && (
          <p className="text-xs opacity-80">
            {crossings.length} tolls · Total {formatMinor(totalMinor, currency)}
          </p>
        )}
      </div>
    </div>
  );
}
