import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type OnboardingHeaderProps = {
  title?: string;
  onBack: () => void;
  variant?: 'simple' | 'centered';
};

export function OnboardingHeader({ title, onBack, variant = 'simple' }: OnboardingHeaderProps) {
  if (variant === 'centered') {
    return (
      <header className="flex items-center justify-between px-[var(--spacing-edge)] h-14 w-full z-50 bg-surface shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="p-2 -ml-2 rounded-full hover:bg-surface-container-high transition-colors active:scale-95 flex items-center justify-center text-primary"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <div className="text-xl font-bold text-primary">{title ?? 'Roam Dash Courier'}</div>
        <div className="w-10" aria-hidden />
      </header>
    );
  }

  return (
    <header className="fixed top-0 w-full bg-background z-50 pt-safe flex items-center px-[var(--spacing-edge)] h-14">
      <button
        type="button"
        onClick={onBack}
        aria-label="Go back"
        className="w-10 h-10 flex items-center justify-center -ml-2 rounded-full hover:bg-surface-container-high transition-colors active:scale-95 text-on-background"
      >
        <MaterialIcon name="arrow_back" />
      </button>
    </header>
  );
}
