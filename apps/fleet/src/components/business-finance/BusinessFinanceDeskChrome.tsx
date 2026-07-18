/**
 * Shared chrome for cash desks under Business Finance — breadcrumb + back.
 */
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';

export function BusinessFinanceDeskChrome({
  deskLabel,
  onBack,
}: {
  deskLabel: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <nav className="flex items-center gap-1 text-slate-500 dark:text-slate-400" aria-label="Breadcrumb">
        <button
          type="button"
          className="hover:text-indigo-600 dark:hover:text-indigo-400 font-medium"
          onClick={onBack}
        >
          Business Finance
        </button>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="text-slate-900 dark:text-slate-100 font-medium">{deskLabel}</span>
      </nav>
      {onBack && (
        <Button type="button" size="sm" variant="ghost" className="h-8 text-slate-600" onClick={onBack}>
          Back to Business Finance
        </Button>
      )}
    </div>
  );
}
