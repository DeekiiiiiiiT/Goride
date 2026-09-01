import React from 'react';
import { useServiceLineScope, type ServiceLineScope } from '../../contexts/ServiceLineScopeContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

const SCOPE_LABELS: Record<ServiceLineScope, string> = {
  all: 'All service lines',
  rideshare: 'Rideshare',
  rush_delivery: 'Rush Delivery',
};

export function ServiceLineScopeSwitcher() {
  const { scope, setScope, showScopeSwitcher } = useServiceLineScope();

  if (!showScopeSwitcher) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs font-medium uppercase tracking-wide text-slate-400 sm:inline">
        Scope
      </span>
      <Select value={scope} onValueChange={(v) => setScope(v as ServiceLineScope)}>
        <SelectTrigger className="h-9 w-[180px] border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900">
          <SelectValue placeholder="Service line" />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SCOPE_LABELS) as ServiceLineScope[]).map((key) => (
            <SelectItem key={key} value={key}>
              {SCOPE_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
