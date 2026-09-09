import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';

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
  allOpen?: boolean;
  onWeekFromChange: (value: string) => void;
  onWeekToChange: (value: string) => void;
  onMinAmountChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onAllOpenChange?: (value: boolean) => void;
  /** Optional trailing actions (export / batch) — same row. */
  trailing?: ReactNode;
};

const DEBOUNCE_MS = 300;

/** Single filter bar for Driver Settlements (rendered once — kills H-5). */
export function SettlementFilters({
  weekFrom,
  weekTo,
  minAmount,
  search,
  allOpen = false,
  onWeekFromChange,
  onWeekToChange,
  onMinAmountChange,
  onSearchChange,
  onAllOpenChange,
  trailing,
}: SettlementFiltersProps) {
  // P-8: debounce search + minAmount so each keystroke does not fire /queue.
  const [localSearch, setLocalSearch] = useState(search);
  const [localMinAmount, setLocalMinAmount] = useState(minAmount);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const minDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  useEffect(() => {
    setLocalMinAmount(minAmount);
  }, [minAmount]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (minDebounceRef.current) clearTimeout(minDebounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Week from</Label>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={weekFrom}
            disabled={allOpen}
            onChange={(e) => onWeekFromChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Week to</Label>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={weekTo}
            disabled={allOpen}
            onChange={(e) => onWeekToChange(e.target.value)}
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
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Min amount</Label>
          <Input
            type="number"
            step="0.01"
            className="h-9 w-[110px]"
            placeholder="0 = show all"
            value={localMinAmount}
            onChange={(e) => {
              const val = e.target.value;
              setLocalMinAmount(val);
              if (minDebounceRef.current) clearTimeout(minDebounceRef.current);
              minDebounceRef.current = setTimeout(() => onMinAmountChange(val), DEBOUNCE_MS);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              className="h-9 w-[200px] pl-8"
              placeholder="Driver or week…"
              value={localSearch}
              onChange={(e) => {
                const val = e.target.value;
                setLocalSearch(val);
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                searchDebounceRef.current = setTimeout(() => onSearchChange(val), DEBOUNCE_MS);
              }}
            />
          </div>
        </div>
      </div>
      {trailing ? <div className="flex flex-wrap gap-2">{trailing}</div> : null}
    </div>
  );
}
