/**
 * Fuel Integrity desk — Fill flags + Stop-to-stop under one week-scoped home.
 */
import { Button } from '../../ui/button';
import {
  FuelFlagsDesk,
  type FuelFlagsPeriodOption,
} from '../flags/FuelFlagsDesk';
import { FuelStopToStopPanel } from './FuelStopToStopPanel';
import { FuelTelematicsPanel } from './FuelTelematicsPanel';
import type { FuelFlagDeskRow } from '../../../utils/fuelFillFlagClassify';
import type { FuelEntry, MileageAdjustment } from '../../../types/fuel';
import type { Trip, FinancialTransaction } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import type { DateRange } from 'react-day-picker';

export type FuelIntegritySubtab = 'fill-flags' | 'stop-to-stop' | 'telematics';

export type { FuelFlagsPeriodOption };

export type FuelIntegrityDeskProps = {
  periods: FuelFlagsPeriodOption[];
  selectedWeekStart: string | null;
  onSelectWeekStart: (weekStart: string) => void;
  subtab: FuelIntegritySubtab;
  onSubtabChange: (subtab: FuelIntegritySubtab) => void;
  rows: FuelFlagDeskRow[];
  loading?: boolean;
  dispositionsTruncated?: boolean;
  canDisposition?: boolean;
  canAcceptCritical?: boolean;
  onAcceptFlag?: (
    row: FuelFlagDeskRow,
    flagCode: string,
    note: string,
    action?: 'accepted' | 'escalated' | 'corrected',
    opts?: { quiet?: boolean },
  ) => Promise<void> | void;
  onEditFill?: (entryId: string) => void;
  onReconcileWeek?: (weekStart: string) => void;
  vehicles: Vehicle[];
  fuelEntries: FuelEntry[];
  trips: Trip[];
  adjustments?: MileageAdjustment[];
  transactions?: FinancialTransaction[];
  dateRange: DateRange | undefined;
  periodLocked?: boolean;
  preferredVehicleId?: string | null;
  tripsLoading?: boolean;
  onRefreshStopToStop?: () => void;
};

export function FuelIntegrityDesk({
  periods,
  selectedWeekStart,
  onSelectWeekStart,
  subtab,
  onSubtabChange,
  rows,
  loading,
  dispositionsTruncated,
  canDisposition,
  canAcceptCritical,
  onAcceptFlag,
  onEditFill,
  onReconcileWeek,
  vehicles,
  fuelEntries,
  trips,
  adjustments,
  transactions,
  dateRange,
  periodLocked = false,
  preferredVehicleId = null,
  tripsLoading = false,
  onRefreshStopToStop,
}: FuelIntegrityDeskProps) {
  const selected = periods.find((p) => p.weekStart === selectedWeekStart) || null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          Period
          <select
            className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={selectedWeekStart || ''}
            onChange={(e) => onSelectWeekStart(e.target.value)}
          >
            {periods.length === 0 && <option value="">No periods</option>}
            {periods.map((p) => (
              <option key={p.weekStart} value={p.weekStart}>
                {p.label}
                {p.locked ? ' · Locked' : ' · Open'}
              </option>
            ))}
          </select>
        </label>
        {selectedWeekStart && onReconcileWeek && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onReconcileWeek(selectedWeekStart)}
          >
            Reconcile this week →
          </Button>
        )}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['fill-flags', 'Fill flags'],
              ['stop-to-stop', 'Stop-to-stop'],
              ['telematics', 'Telematics'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={subtab === id ? 'default' : 'outline'}
              className={`min-h-9 ${
                subtab === id ? 'bg-[#3525cd] text-white hover:bg-[#2a1ea4]' : ''
              }`}
              onClick={() => onSubtabChange(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        {selected?.locked ? (
          <p className="w-full text-xs font-medium text-slate-500 sm:w-auto">Week locked</p>
        ) : null}
      </div>

      {subtab === 'fill-flags' ? (
        <FuelFlagsDesk
          periods={periods}
          selectedWeekStart={selectedWeekStart}
          onSelectWeekStart={onSelectWeekStart}
          rows={rows}
          loading={loading}
          dispositionsTruncated={dispositionsTruncated}
          canDisposition={canDisposition}
          canAcceptCritical={canAcceptCritical}
          onAcceptFlag={onAcceptFlag}
          onEditFill={onEditFill}
          embeddedInShell
        />
      ) : subtab === 'stop-to-stop' ? (
        <FuelStopToStopPanel
          vehicles={vehicles}
          fuelEntries={fuelEntries}
          trips={trips}
          adjustments={adjustments}
          transactions={transactions}
          dateRange={dateRange}
          periodLocked={periodLocked || Boolean(selected?.locked)}
          preferredVehicleId={preferredVehicleId}
          tripsLoading={tripsLoading}
          onRefresh={onRefreshStopToStop}
        />
      ) : (
        <FuelTelematicsPanel
          vehicles={vehicles}
          preferredVehicleId={preferredVehicleId}
          weekStart={selectedWeekStart}
          weekEnd={selected?.weekEnd || null}
        />
      )}
    </div>
  );
}
