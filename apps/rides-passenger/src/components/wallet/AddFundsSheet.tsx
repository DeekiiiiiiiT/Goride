import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, CreditCard, Lock, X } from 'lucide-react';
import {
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

const PRESET_AMOUNTS = [25, 50, 100, 200] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  balanceUsd: number;
};

function formatUsd(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseAmountInput(raw: string): number {
  const parsed = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function AddFundsSheet({ open, onClose, balanceUsd }: Props) {
  const [amount, setAmount] = useState('50.00');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(50);

  const selectPreset = useCallback((value: number) => {
    setSelectedPreset(value);
    setAmount(value.toFixed(2));
  }, []);

  const handleAmountChange = (raw: string) => {
    setSelectedPreset(null);
    setAmount(raw);
  };

  const handleAmountBlur = () => {
    const value = parseAmountInput(amount);
    setAmount(value.toFixed(2));
  };

  const handleAddFunds = () => {
    const value = parseAmountInput(amount);
    if (value <= 0) {
      toast.error('Enter an amount greater than $0');
      return;
    }
    toast.message('Coming soon');
  };

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

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 transition-opacity"
        aria-label="Close add funds"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-funds-title"
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
          <h2 id="add-funds-title" className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
            Add Funds
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

        <div className="space-y-8 px-5 pb-8">
          <div className="flex flex-col items-center justify-center py-6">
            <div className="flex items-baseline gap-1" style={{ color: ON_SURFACE }}>
              <span className="text-[30px] font-bold tracking-tight opacity-50">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                onBlur={handleAmountBlur}
                className="w-44 border-none bg-transparent p-0 text-center text-[30px] font-bold tracking-tight outline-none focus:ring-0"
                style={{ color: ON_SURFACE }}
                aria-label="Amount to add"
              />
            </div>
            <p className="mt-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Current Wallet Balance: ${formatUsd(balanceUsd)}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {PRESET_AMOUNTS.map((preset) => {
              const active = selectedPreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  className="rounded-2xl px-6 py-3 text-xs font-bold tracking-wide transition-all active:scale-95"
                  style={
                    active
                      ? {
                          border: `2px solid ${PRIMARY}`,
                          backgroundColor: 'color-mix(in srgb, var(--passenger-primary-container) 12%, transparent)',
                          color: PRIMARY,
                        }
                      : {
                          border: `1px solid ${OUTLINE_VARIANT}`,
                          color: ON_SURFACE,
                        }
                  }
                >
                  ${preset}
                </button>
              );
            })}
          </div>

          <div
            className="rounded-[24px] border p-1"
            style={{
              backgroundColor: SURFACE_LOW,
              borderColor: 'color-mix(in srgb, var(--passenger-outline-variant) 50%, transparent)',
            }}
          >
            <button
              type="button"
              onClick={() => toast.message('Coming soon')}
              className="group flex w-full items-center justify-between rounded-[20px] p-4 text-left transition-colors passenger-row-hover"
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-8 w-12 items-center justify-center rounded-lg border shadow-sm"
                  style={{
                    backgroundColor: SURFACE_LOWEST,
                    borderColor: OUTLINE_VARIANT,
                  }}
                >
                  <CreditCard className="h-5 w-5" style={{ color: PRIMARY }} aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-bold tracking-wide" style={{ color: ON_SURFACE }}>
                    Default Payment
                  </p>
                  <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                    Visa •••• 1234
                  </p>
                </div>
              </div>
              <div
                className="flex items-center gap-2 text-xs font-bold tracking-wide transition-transform group-active:translate-x-0.5"
                style={{ color: PRIMARY }}
              >
                <span>Edit</span>
                <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
              </div>
            </button>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleAddFunds}
              className="flex h-14 w-full items-center justify-center rounded-2xl text-lg font-semibold shadow-lg transition-all active:scale-[0.98] hover:opacity-95"
              style={{
                backgroundColor: PRIMARY,
                color: ON_PRIMARY,
                boxShadow: '0 10px 24px color-mix(in srgb, var(--passenger-primary) 22%, transparent)',
              }}
            >
              Add Funds
            </button>
            <div
              className="flex items-center justify-center gap-2 opacity-70"
              style={{ color: ON_SURFACE_VARIANT }}
            >
              <Lock className="h-4 w-4" aria-hidden />
              <p className="text-[11px] font-semibold">Secure 256-bit encrypted transaction</p>
            </div>
          </div>
        </div>

        <div className="h-6 w-full safe-b" aria-hidden />
      </div>
    </div>
  );
}
