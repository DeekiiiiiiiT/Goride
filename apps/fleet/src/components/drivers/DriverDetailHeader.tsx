/** Namespace lucide — Vite HMR must not TDZ named icons on driver detail. */
import * as Lucide from 'lucide-react';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';
import { DriverFuelPolicySelect } from './DriverFuelPolicySelect';

const {
  Star,
  AlertTriangle,
  Calendar: CalendarIcon,
  Award,
  CreditCard: CreditCardIcon,
  Car: CarIcon,
} = Lucide;

export type DriverDetailHeaderProps = {
  driverId: string;
  driverName: string;
  driver?: any;
  vehicleLabel: string | null;
  memberSinceLabel: string | null;
  licenseNumberLabel: string | null;
  licenseExpiryLabel: string | null;
  licenseExpired: boolean;
  dispatchBlockReason?: string;
  tierName?: string | null;
  lifetimeTrips: number | null;
  performanceLoading: boolean;
  currentRating: number;
  ratingReady: boolean;
  tripsLabel: string;
  ratingLabel: string;
  /** Period completed trips from operational rollup when available (> 0). */
  periodCompletedCount?: number | null;
};

export function DriverDetailHeader({
  driverId,
  driverName,
  driver,
  vehicleLabel,
  memberSinceLabel,
  licenseNumberLabel,
  licenseExpiryLabel,
  licenseExpired,
  dispatchBlockReason,
  tierName,
  lifetimeTrips,
  performanceLoading,
  currentRating,
  ratingReady,
  tripsLabel,
  ratingLabel,
  periodCompletedCount,
}: DriverDetailHeaderProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-slate-900 p-6 rounded-xl border shadow-sm">
      <div className="flex items-start gap-4 col-span-1 md:col-span-2">
        <Avatar className="h-20 w-20 border-4 border-slate-50 dark:border-slate-800 shadow-md">
          <AvatarFallback className="text-xl bg-indigo-100 text-indigo-700">
            {driverName.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{driverName}</h1>
            <Badge
              className={cn(
                'px-3 py-0.5 font-bold uppercase tracking-widest text-[10px]',
                driver?.status === 'Inactive'
                  ? 'bg-rose-600 text-white animate-pulse border-none shadow-lg shadow-rose-200'
                  : 'bg-emerald-100 text-emerald-700',
              )}
            >
              {driver?.status === 'Inactive' ? 'TERMINATED' : driver?.status || 'Active'}
            </Badge>
            {licenseExpired && (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                Dispatch blocked
              </Badge>
            )}
          </div>
          <div className="text-sm text-slate-500 flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <CreditCardIcon className="h-3 w-3" /> ID: {driverId}
            </span>
            {driver?.uberDriverId && (
              <span className="text-xs text-slate-400 ml-5 block">Uber UUID: {driver.uberDriverId}</span>
            )}
            {driver?.inDriveDriverId && (
              <span className="text-xs text-slate-400 ml-5 block">InDrive UUID: {driver.inDriveDriverId}</span>
            )}
            <span className="flex items-center gap-2">
              <CarIcon className="h-3 w-3" /> Vehicle: {vehicleLabel || '—'}
            </span>
            <span className="flex items-center gap-2">
              <CalendarIcon className="h-3 w-3" /> Member Since: {memberSinceLabel || '—'}
            </span>
            {licenseNumberLabel && (
              <span className="flex items-center gap-2 text-xs">License #: {licenseNumberLabel}</span>
            )}
            {licenseExpiryLabel && (
              <span
                className={cn(
                  'flex items-center gap-2 text-xs flex-wrap',
                  licenseExpired && 'text-rose-600 font-medium',
                )}
              >
                License expiry: {licenseExpiryLabel}
                {licenseExpired && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    Dispatch blocked{dispatchBlockReason ? ` — ${dispatchBlockReason}` : ''}
                  </Badge>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="col-span-1 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6 flex flex-col justify-center space-y-3">
        <DriverFuelPolicySelect driver={driver} driverId={driverId} />
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-500">Performance Tier</span>
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-700 flex items-center gap-1"
          >
            <Award className="h-3 w-3" /> {(tierName || 'BRONZE').toUpperCase()}
          </Badge>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-500">Total Lifetime {tripsLabel}</span>
          {performanceLoading ? (
            <Skeleton className="h-5 w-12" />
          ) : (
            <span className="font-semibold">{lifetimeTrips != null ? lifetimeTrips : '—'}</span>
          )}
        </div>
        {periodCompletedCount != null && periodCompletedCount > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500">Period {tripsLabel}</span>
            <span className="font-semibold">{periodCompletedCount}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-500">Current {ratingLabel}</span>
          <div className="flex items-center gap-1 text-amber-500 font-bold">
            {performanceLoading ? (
              <Skeleton className="h-5 w-14" />
            ) : ratingReady && currentRating > 0 ? (
              <>
                {currentRating.toFixed(1)} <Star className="h-4 w-4 fill-current" />
              </>
            ) : (
              <span className="text-slate-400 font-medium">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
