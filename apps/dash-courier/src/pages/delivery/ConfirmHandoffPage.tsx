import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type ConfirmHandoffPageProps = {
  onBack: () => void;
  onComplete: () => void;
  onCustomerUnavailable: () => void;
};

export function ConfirmHandoffPage({
  onBack,
  onComplete,
  onCustomerUnavailable,
}: ConfirmHandoffPageProps) {
  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col">
      <header className="bg-surface shadow-sm fixed top-0 w-full z-50 flex justify-between items-center px-[var(--spacing-edge)] h-14 pt-safe">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="p-2 -ml-2 rounded-full hover:bg-surface-container-high active:scale-95 text-on-surface"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-xl font-bold text-primary">Roam Dash Courier</h1>
        <div className="w-8" aria-hidden />
      </header>

      <main className="flex-grow pt-[72px] pb-[120px] px-[var(--spacing-edge)] w-full max-w-md mx-auto flex flex-col justify-center items-center">
        <div className="w-full flex flex-col items-center text-center gap-8">
          <div className="w-32 h-32 bg-primary-container rounded-full flex items-center justify-center shadow-primary">
            <MaterialIcon name="handshake" className="text-[64px] text-primary" filled />
          </div>
          <div className="space-y-2">
            <h2 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface">
              Confirm handoff to customer
            </h2>
            <p className="text-base text-muted">
              You selected hand to customer. Ensure you have given the order to the correct person.
            </p>
          </div>
          <button
            type="button"
            onClick={onCustomerUnavailable}
            className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-1 active:opacity-70"
          >
            <MaterialIcon name="help" className="text-base" />
            Customer not available?
          </button>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.04)] px-[var(--spacing-edge)] pt-4 pb-safe z-50">
        <button
          type="button"
          onClick={onComplete}
          className="w-full max-w-md mx-auto h-14 bg-primary text-on-primary rounded-lg text-xl font-semibold flex items-center justify-center shadow-primary active:scale-[0.98] gap-2"
        >
          <MaterialIcon name="check_circle" />
          Complete Delivery
        </button>
      </div>
    </div>
  );
}
