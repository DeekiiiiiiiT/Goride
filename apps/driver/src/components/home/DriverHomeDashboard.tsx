import React, { useState } from 'react';
import { CheckCircle, Loader2, Radio, RefreshCw, Star } from 'lucide-react';
import { cn } from '@roam/ui';
import { formatMoneyMinor } from '@roam/types/rides';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { useIndependentEarnings } from '../../hooks/useIndependentEarnings';
import { useOnlineSessionDuration } from '../../hooks/useOnlineSessionDuration';
import { OnlineGaugeSlider } from '../rides/OnlineGaugeSlider';
import { DriverHomePeriodToggle, type HomePeriod } from './DriverHomeEarningsHero';

function formatStatAmount(minor: number, currency: string): string {
  return formatMoneyMinor(minor, currency).replace(/^[A-Z]{3}\s+/i, '').trim();
}

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  loading?: boolean;
};

function StatCard({ label, value, valueClassName, loading }: StatCardProps) {
  return (
    <div className="driver-home-premium-card flex-1 p-4">
      <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
      ) : (
        <p className={cn('text-xl font-bold tabular-nums text-slate-900 dark:text-white', valueClassName)}>
          {value}
        </p>
      )}
    </div>
  );
}

type Props = {
  tripFlowActive: boolean;
  /** Fleet-only: small manual "Start Trip" control rendered under the stats row. */
  startTripSlot?: React.ReactNode;
};

export function DriverHomeDashboard({ tripFlowActive, startTripSlot }: Props) {
  const [period, setPeriod] = useState<HomePeriod>('today');
  const { data, loading, error, refresh } = useIndependentEarnings(period);
  const { driverRecord } = useCurrentDriver();
  const { online, goingOnline, toggleOnline, locationGoOnlineBlocked } = useRideDispatchContext();
  const onlineTime = useOnlineSessionDuration(online);

  const rating =
    typeof driverRecord?.rating === 'number'
      ? driverRecord.rating
      : typeof driverRecord?.ratingLast500 === 'number'
        ? driverRecord.ratingLast500
        : null;

  const earningsAmount =
    data != null
      ? formatStatAmount(data.total_minor ?? data.cash_minor + data.digital_minor, data.currency)
      : loading
        ? null
        : formatStatAmount(0, 'JMD');

  const tripCount = data?.trip_count ?? 0;
  const tripLabel = tripCount === 1 ? '1 Trip' : `${tripCount} Trips`;
  const earningsLabel = period === 'today' ? "Today's Earnings" : 'Work Week Earnings';

  if (tripFlowActive) return null;

  return (
    <div className="flex h-full min-h-0 flex-col px-6 pb-1 pt-2">
      <div className="shrink-0">
        <DriverHomePeriodToggle period={period} onPeriodChange={setPeriod} />
        <div className="flex w-full gap-3">
        <StatCard
          label={earningsLabel}
          value={earningsAmount ?? '—'}
          valueClassName="text-[#006d43] dark:text-[#59de9b]"
          loading={loading && !data}
        />
        <StatCard
          label="Online Time"
          value={online ? onlineTime : '0m'}
          loading={false}
        />
        </div>
        {startTripSlot ? <div className="mt-3 flex justify-end">{startTripSlot}</div> : null}
      </div>

      {error ? (
        <div className="mt-3 flex shrink-0 items-center justify-center gap-2 text-center">
          <p className="text-xs text-red-500">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#006d43] dark:text-[#59de9b]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Retry
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 items-center justify-center py-2">
        <div className="driver-home-pulse-container flex items-center justify-center">
          {online ? (
            <>
              <div className="driver-home-pulse-ring" aria-hidden />
              <div className="driver-home-pulse-ring" aria-hidden />
              <div className="driver-home-pulse-ring" aria-hidden />
            </>
          ) : null}
          <div
            className={cn(
              'driver-home-status-orb',
              online ? 'driver-home-status-orb--online' : 'driver-home-status-orb--offline',
            )}
          >
            <Radio className="h-9 w-9 text-white" strokeWidth={2.25} aria-hidden />
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {online ? 'You are Online' : 'You are Offline'}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {online
              ? 'Waiting for nearby passengers…'
              : locationGoOnlineBlocked
                ? 'Allow location to go online'
                : 'Slide below to start receiving rides'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="driver-home-premium-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#006d43]/20 text-[#006d43] dark:text-[#59de9b]">
              <CheckCircle className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Accepted</p>
              {loading && !data ? (
                <Loader2 className="mt-1 h-5 w-5 animate-spin text-slate-400" />
              ) : (
                <p className="text-lg font-bold text-slate-900 dark:text-white">{tripLabel}</p>
              )}
            </div>
          </div>
          <div className="driver-home-premium-card flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#006d43]/20 text-[#006d43] dark:text-[#59de9b]">
              <Star className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Rating</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {rating != null && Number.isFinite(rating) ? rating.toFixed(2) : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="driver-home-premium-card mt-4 rounded-3xl p-4 shadow-2xl">
          <OnlineGaugeSlider
            variant="premium"
            online={online}
            goingOnline={goingOnline}
            onToggle={toggleOnline}
            disabled={!online && locationGoOnlineBlocked}
          />
        </div>
      </div>
    </div>
  );
}
