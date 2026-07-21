/**
 * Vehicle multi-select used by the New Expense wizard and Rule Builder.
 * Checkbox list with search + select-all; 44px touch rows.
 */
import React from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { HubLoading, HubError } from './HubStates';
import { useVehicleOptions } from './useVehicleOptions';

export function VehicleMultiSelect({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: options, isLoading, isError, refetch } = useVehicleOptions();
  const [search, setSearch] = React.useState('');

  if (isLoading) return <HubLoading label="Loading vehicles…" />;
  if (isError) return <HubError message="Failed to load vehicles." onRetry={() => void refetch()} />;

  const all = options || [];
  const filtered = search.trim()
    ? all.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : all;

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
          <Input
            aria-label="Search vehicles"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plate, make or model"
            className="h-11 pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 whitespace-nowrap"
          onClick={() =>
            onChange(Array.from(new Set([...selectedIds, ...filtered.map((o) => o.id)])))
          }
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => onChange([])}
        >
          Clear
        </Button>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-slate-500">No vehicles match.</p>
        ) : (
          filtered.map((o) => (
            <label
              key={o.id}
              className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
            >
              <Checkbox
                aria-label={`Select ${o.label}`}
                checked={selectedIds.includes(o.id)}
                onCheckedChange={() => toggle(o.id)}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                {o.label}
              </span>
              {selectedIds.includes(o.id) && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              )}
            </label>
          ))
        )}
      </div>
      <p className="text-xs font-medium text-slate-500" aria-live="polite">
        {selectedIds.length} vehicle{selectedIds.length === 1 ? '' : 's'} selected
      </p>
    </div>
  );
}
