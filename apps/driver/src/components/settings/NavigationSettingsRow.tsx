import React from 'react';
import { ChevronRight, Navigation } from 'lucide-react';
import { cn } from '@roam/ui';
import { useNavigationPreference } from '../../contexts/NavigationPreferenceContext';

type Props = {
  onClick: () => void;
};

const cardClass =
  'rounded-[24px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:bg-slate-900 dark:shadow-none dark:border dark:border-slate-800';

export function NavigationSettingsRow({ onClick }: Props) {
  const { label } = useNavigationPreference();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        cardClass,
        'flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-slate-50 active:scale-[0.99] dark:hover:bg-slate-800/80',
      )}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          <Navigation className="h-6 w-6 text-slate-500" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white">Navigation</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
    </button>
  );
}
