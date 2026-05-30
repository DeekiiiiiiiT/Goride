import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, PlusCircle, X } from 'lucide-react';
import {
  TRIP_PAYMENT_METHODS,
  type TripPaymentMethodId,
  type TripPaymentMethodOption,
} from '@/lib/tripPaymentMethods';
import { TripPaymentMethodIcon } from '@/components/TripPaymentMethodIcon';

type Props = {
  open: boolean;
  selectedId: TripPaymentMethodId;
  onClose: () => void;
  onSelect: (id: TripPaymentMethodId) => void;
};

function MethodRow({
  method,
  selected,
  onSelect,
}: {
  method: TripPaymentMethodOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors active:scale-[0.99] touch-manipulation"
      style={{
        backgroundColor: selected
          ? 'color-mix(in srgb, var(--home-primary) 10%, var(--home-card-bg))'
          : 'var(--home-card-bg)',
        border: selected
          ? '1px solid color-mix(in srgb, var(--home-primary) 35%, transparent)'
          : '1px solid var(--home-card-border)',
      }}
    >
      <TripPaymentMethodIcon icon={method.icon} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--home-on-surface)' }}>
          {method.barLabel}
        </p>
        {method.subtitle && (
          <p className="text-xs truncate" style={{ color: 'var(--home-on-surface-muted)' }}>
            {method.subtitle}
          </p>
        )}
      </div>
      {selected ? (
        <Check className="h-5 w-5 shrink-0" style={{ color: 'var(--home-primary)' }} aria-hidden />
      ) : (
        <span className="h-5 w-5 shrink-0" aria-hidden />
      )}
    </button>
  );
}

export function TripPaymentMethodSheet({ open, selectedId, onClose, onSelect }: Props) {
  const navigate = useNavigate();

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
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Close payment methods"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-xl rounded-t-3xl px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3 safe-x"
        style={{
          backgroundColor: 'var(--home-sheet-bg, var(--home-card-bg))',
          borderTop: '1px solid var(--home-sheet-border)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-payment-sheet-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="trip-payment-sheet-title"
            className="text-lg font-bold"
            style={{ color: 'var(--home-on-surface)' }}
          >
            Payment method
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 transition-colors active:scale-95"
            style={{ color: 'var(--home-on-surface-muted)' }}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <p className="mb-3 text-sm" style={{ color: 'var(--home-on-surface-muted)' }}>
          Choose how you want to pay for this trip.
        </p>

        <div className="space-y-2 max-h-[min(50dvh,360px)] overflow-y-auto">
          {TRIP_PAYMENT_METHODS.map((method) => (
            <MethodRow
              key={method.id}
              method={method}
              selected={method.id === selectedId}
              onSelect={() => {
                onSelect(method.id);
                onClose();
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            navigate('/account/wallet/payment-methods');
          }}
          className="mt-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.99]"
          style={{
            borderColor: 'var(--home-card-border)',
            color: 'var(--home-primary)',
          }}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <PlusCircle className="h-5 w-5" aria-hidden />
            Add or manage payment methods
          </span>
          <ChevronRight className="h-5 w-5 opacity-60" aria-hidden />
        </button>
      </div>
    </div>
  );
}
