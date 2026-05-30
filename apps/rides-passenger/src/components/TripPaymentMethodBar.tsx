import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { TripPaymentMethodOption } from '@/lib/tripPaymentMethods';
import { TripPaymentMethodIcon } from '@/components/TripPaymentMethodIcon';

type Props = {
  method: TripPaymentMethodOption;
  onPress: () => void;
};

export function TripPaymentMethodBar({ method, onPress }: Props) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="mb-3 flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors active:scale-[0.99] touch-manipulation"
      style={{
        borderColor: 'var(--home-card-border)',
        backgroundColor: 'var(--home-card-bg)',
      }}
      aria-label={`Payment method: ${method.barLabel}. Tap to change.`}
    >
      <TripPaymentMethodIcon icon={method.icon} className="h-8 w-8" />
      <span
        className="min-w-0 flex-1 truncate text-sm font-semibold"
        style={{ color: 'var(--home-on-surface)' }}
      >
        {method.barLabel}
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0"
        style={{ color: 'var(--home-on-surface-muted)' }}
        aria-hidden
      />
    </button>
  );
}
