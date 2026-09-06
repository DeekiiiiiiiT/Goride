import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

export type SettlementFiltersValue = {
  weekFrom: string;
  weekTo: string;
  minAmount: string;
  search: string;
};

export type SettlementFiltersProps = {
  weekFrom: string;
  weekTo: string;
  minAmount: string;
  search: string;
  onWeekFromChange: (value: string) => void;
  onWeekToChange: (value: string) => void;
  onMinAmountChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  /** Optional trailing actions (export / batch) — same row. */
  trailing?: ReactNode;
};

/** Single filter bar for Driver Settlements (rendered once — kills H-5). */
export function SettlementFilters({
  weekFrom,
  weekTo,
  minAmount,
  search,
  onWeekFromChange,
  onWeekToChange,
  onMinAmountChange,
  onSearchChange,
  trailing,
}: SettlementFiltersProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Week from</Label>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={weekFrom}
            onChange={(e) => onWeekFromChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Week to</Label>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={weekTo}
            onChange={(e) => onWeekToChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Min amount</Label>
          <Input
            type="number"
            step="0.01"
            className="h-9 w-[110px]"
            placeholder="0 = show all"
            value={minAmount}
            onChange={(e) => onMinAmountChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              className="h-9 w-[200px] pl-8"
              placeholder="Driver or week…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>
      {trailing ? <div className="flex flex-wrap gap-2">{trailing}</div> : null}
    </div>
  );
}
