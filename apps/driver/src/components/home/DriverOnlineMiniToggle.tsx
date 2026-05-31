import React from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@roam/ui';

type Props = {
  online: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
};

export function DriverOnlineMiniToggle({ online, onToggle, disabled = false, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={online}
      aria-label={online ? 'Online — tap to go offline' : 'Offline — tap to go online'}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onToggle();
      }}
      className={cn(
        'relative h-10 w-24 shrink-0 overflow-hidden rounded-full border p-1 transition-opacity touch-manipulation',
        'border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center pl-3 text-[10px] font-bold uppercase tracking-wide transition-colors',
          online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400',
        )}
      >
        {online ? 'On' : 'Off'}
      </span>
      <span
        className={cn(
          'relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-200 ease-out dark:bg-slate-900',
          online ? 'translate-x-[3.25rem]' : 'translate-x-0',
        )}
      >
        <Zap
          className={cn('h-4 w-4', online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}
          aria-hidden
        />
      </span>
    </button>
  );
}
