import type { ReactNode } from 'react';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { PeriodWeekDropdown } from '../../ui/PeriodWeekDropdown';

export type SettlementFiltersValue = {
  weekFrom: string;
  weekTo: string;
};

export type SettlementFiltersProps = {
  weekFrom: string;
  weekTo: string;
  allOpen?: boolean;
  onWeekFromChange: (value: string) => void;
  onWeekToChange: (value: string) => void;
  onAllOpenChange?: (value: boolean) => void;
  /** Optional trailing actions (batch collect/pay) — same row. */
  trailing?: ReactNode;
};

/** Single filter bar for Driver Settlements (rendered once — kills H-5). */
export function SettlementFilters({
  weekFrom,
  weekTo,
  allOpen = false,
  onWeekFromChange,
  onWeekToChange,
  onAllOpenChange,
  trailing,
}: SettlementFiltersProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Period</Label>
          <PeriodWeekDropdown
            selectedStart={weekFrom}
            selectedEnd={weekTo}
            placeholder="Select week period"
            buttonClassName="h-9 text-xs"
            allowCustomRange
            disabled={allOpen}
            title={allOpen ? 'Turn off All open to pick a period' : undefined}
            weekCount={16}
            onSelect={(period) => {
              if (!period.startDate || !period.endDate) return;
              // Selecting a period implies scoped weeks (not “all open”).
              onAllOpenChange?.(false);
              onWeekFromChange(period.startDate);
              onWeekToChange(period.endDate);
            }}
          />
        </div>
        {onAllOpenChange ? (
          <div className="space-y-1">
            <Label htmlFor="settlements-all-open" className="text-xs text-slate-500">
              All open
            </Label>
            <div className="flex h-9 items-center gap-2">
              <Switch
                id="settlements-all-open"
                checked={allOpen}
                onCheckedChange={onAllOpenChange}
                aria-label="Show all open weeks without a date limit"
              />
              <span className="text-[11px] text-slate-400">
                {allOpen ? 'Dates ignored' : 'Selected weeks'}
              </span>
            </div>
          </div>
        ) : null}
      </div>
      {trailing ? <div className="flex flex-wrap gap-2">{trailing}</div> : null}
    </div>
  );
}
