import React from 'react';
import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import type { TripPaymentMethodIcon as IconKind } from '@/lib/tripPaymentMethods';

type Props = {
  icon: IconKind;
  className?: string;
};

export function TripPaymentMethodIcon({ icon, className = 'h-6 w-6' }: Props) {
  if (icon === 'apple') {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md bg-zinc-900 ${className}`}
        aria-hidden
      >
        <Smartphone className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }

  if (icon === 'visa') {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md bg-[#1a1f71] ${className}`}
        aria-hidden
      >
        <span className="text-[9px] font-bold tracking-tight text-white">VISA</span>
      </div>
    );
  }

  if (icon === 'cash') {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-950/50 ${className}`}
        aria-hidden
      >
        <Banknote className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 ${className}`}
      aria-hidden
    >
      <CreditCard className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300" />
    </div>
  );
}
