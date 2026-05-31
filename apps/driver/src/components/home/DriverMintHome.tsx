import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { ThemeToggleButton } from '../layout/ThemeToggleButton';
import { useRideDispatchContext } from '../../contexts/RideDispatchContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { RideDispatchHome } from '../rides/RideDispatchHome';
import { DriverHomeEarningsHero } from './DriverHomeEarningsHero';
import { DriverHomeQuickStats } from './DriverHomeQuickStats';
import { DriverOnlineMiniToggle } from './DriverOnlineMiniToggle';

type Props = {
  onNavigate: (page: string) => void;
};

export function DriverMintHome({ onNavigate }: Props) {
  const { driverRecord } = useCurrentDriver();
  const { online, toggleOnline, locationGoOnlineBlocked } = useRideDispatchContext();
  const rating =
    typeof driverRecord?.rating === 'number'
      ? driverRecord.rating
      : typeof driverRecord?.ratingLast500 === 'number'
        ? driverRecord.ratingLast500
        : null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 py-3">
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
        <button
          type="button"
          onClick={() => onNavigate('vehicle')}
          className="rounded-xl bg-emerald-600 p-3 text-white transition-transform active:scale-95"
          aria-label="Vehicle settings"
        >
          <ArrowLeftRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <DriverHomeEarningsHero />

      <div className="px-4">
        <div className="-mt-4 rounded-[2.5rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <DriverHomeQuickStats rating={rating} />

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

      <div className="min-h-0 flex-1 px-4 pt-4">
        <RideDispatchHome embedded />
      </div>
    </div>
  );
}
