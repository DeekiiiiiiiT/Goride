import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ThemeToggleButton } from '../layout/ThemeToggleButton';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { useIndependentEarnings } from '../../hooks/useIndependentEarnings';
import { RideDispatchHome } from '../rides/RideDispatchHome';
import { DriverHomePeriodToggle, type HomePeriod } from './DriverHomeEarningsHero';
import { DriverHomeQuickStats } from './DriverHomeQuickStats';
import { DriverOnlineMiniToggle } from './DriverOnlineMiniToggle';

export function DriverMintHome() {
  const [period, setPeriod] = useState<HomePeriod>('today');
  const { data, loading, error, refresh } = useIndependentEarnings(period);
  const { driverRecord } = useCurrentDriver();
  const { online, toggleOnline, locationGoOnlineBlocked, activeRide } = useRideDispatchContext();
  const enRouteToPickup =
    activeRide?.status === 'driver_assigned' || activeRide?.status === 'driver_en_route_pickup';
  const onTrip = activeRide?.status === 'on_trip';
  const tripFlowActive = enRouteToPickup || onTrip;
  const rating =
    typeof driverRecord?.rating === 'number'
      ? driverRecord.rating
      : typeof driverRecord?.ratingLast500 === 'number'
        ? driverRecord.ratingLast500
        : null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center px-4 py-3">
        <div className="flex items-center gap-3">
          <ThemeToggleButton className="rounded-xl border-0 bg-slate-100 p-3 shadow-none dark:bg-slate-800" />
          <div
            className={`flex items-center gap-2 rounded-full border px-4 py-2 ${
              online
                ? 'border-emerald-500/20 bg-emerald-500/10'
                : 'border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-600' : 'bg-slate-400'}`}
              aria-hidden
            />
            <span
              className={`text-xs font-bold tracking-wider ${
                online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
              }`}
            >
              {online ? "YOU'RE ONLINE" : "YOU'RE OFFLINE"}
            </span>
          </div>
        </div>
      </div>

      {!tripFlowActive ? (
        <div className="px-4 pt-2">
          <div className="rounded-[2.5rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <DriverHomePeriodToggle period={period} onPeriodChange={setPeriod} />
            {error && (
              <div className="mb-4 flex flex-col items-center gap-2 text-center">
                <p className="max-w-xs text-sm text-red-500">{error}</p>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden />
                  Retry
                </button>
              </div>
            )}
            <DriverHomeQuickStats data={data} loading={loading} rating={rating} />

            <div className="mt-6 flex flex-col items-center gap-3">
              <DriverOnlineMiniToggle online={online} onToggle={toggleOnline} />
              <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                {online
                  ? 'Tap to go offline'
                  : locationGoOnlineBlocked
                    ? 'Tap to go online — location permission required'
                    : 'Tap to go online and receive ride requests'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!tripFlowActive ? (
        <div className="min-h-0 flex-1 px-4 pt-4">
          <RideDispatchHome embedded />
        </div>
      ) : null}
    </div>
  );
}
