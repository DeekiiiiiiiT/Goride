import React, { useEffect } from 'react';
import { toast } from 'sonner';
import { Building2, ChevronRight, Smartphone, X } from 'lucide-react';
import { formatMoneyMinorPlain } from '@roam/types/rides';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type WithdrawMethodId = 'lynk' | 'bank_account';

type WithdrawOption = {
  id: WithdrawMethodId;
  title: string;
  subtitle: string;
  Icon: typeof Smartphone;
};

const WITHDRAW_OPTIONS: WithdrawOption[] = [
  {
    id: 'lynk',
    title: 'Lynk',
    subtitle: 'Withdraw change to your Lynk wallet in Jamaica',
    Icon: Smartphone,
  },
  {
    id: 'bank_account',
    title: 'Bank account',
    subtitle: 'Transfer to a linked Jamaican bank account',
    Icon: Building2,
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
  availableMinor: number;
};

export function WithdrawSheet({ open, onClose, availableMinor }: Props) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = (id: WithdrawMethodId) => {
    if (availableMinor <= 0) {
      toast.error('No wallet balance available to withdraw');
      return;
    }
    if (id === 'lynk') {
      toast.message('Lynk withdrawals coming soon');
    } else {
      toast.message('Bank account withdrawals coming soon');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 transition-opacity"
        aria-label="Close withdraw"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-title"
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-t-[32px] shadow-2xl safe-x"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="h-1.5 w-12 rounded-full"
            style={{ backgroundColor: OUTLINE_VARIANT }}
            aria-hidden
          />
        </div>

        <div className="flex items-center justify-between px-5 py-4">
          <h2 id="withdraw-title" className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
            Withdraw
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95 passenger-row-hover"
            style={{ color: ON_SURFACE_VARIANT }}
            aria-label="Close"
          >
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>

        <div className="space-y-6 px-5 pb-8">
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            Choose where to send your ride change. Available balance:{' '}
            <span className="font-semibold tabular-nums" style={{ color: ON_SURFACE }}>
              {formatMoneyMinorPlain(availableMinor)}
            </span>
          </p>

          <div className="space-y-3">
            {WITHDRAW_OPTIONS.map(({ id, title, subtitle, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleSelect(id)}
                className="group flex w-full items-center gap-4 rounded-[20px] border p-4 text-left transition-all active:scale-[0.99] passenger-row-hover"
                style={{
                  backgroundColor: SURFACE_LOW,
                  borderColor: 'color-mix(in srgb, var(--passenger-outline-variant) 50%, transparent)',
                }}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--passenger-primary) 10%, transparent)',
                  }}
                >
                  <Icon className="h-6 w-6" style={{ color: PRIMARY }} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold" style={{ color: ON_SURFACE }}>
                    {title}
                  </p>
                  <p className="mt-0.5 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                    {subtitle}
                  </p>
                </div>
                <ChevronRight
                  className="h-5 w-5 shrink-0 transition-transform group-active:translate-x-0.5"
                  style={{ color: PRIMARY }}
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </div>

        <div className="h-6 w-full safe-b" aria-hidden />
      </div>
    </div>
  );
}
