import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type SubPageHeaderProps = {
  title: string;
  onBack: () => void;
  backLabel?: string;
};

export function SubPageHeader({ title, onBack, backLabel = 'Go back' }: SubPageHeaderProps) {
  return (
    <header className="w-full sticky top-0 bg-surface shadow-soft z-50 pt-safe shrink-0">
      <div className="flex justify-between items-center h-16 px-[var(--spacing-edge)]">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low text-primary active:scale-95 transition-transform -ml-2"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-xl font-bold text-primary flex-1 text-center pr-10">{title}</h1>
      </div>
    </header>
  );
}
