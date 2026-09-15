/**
 * Shared chrome for cash desks under Business Finance — breadcrumb only (desktop).
 * Mobile already shows the page title in AppLayout; click “Business Finance” on desktop to go back.
 */
import React from 'react';
import { ChevronRight } from 'lucide-react';

export function BusinessFinanceDeskChrome({
  deskLabel,
  onBack,
}: {
  deskLabel: string;
  onBack?: () => void;
}) {
  return (
    <div className="hidden flex-wrap items-center gap-2 text-sm md:flex">
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
    </div>
  );
}
