import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type ConfirmHandoffPageProps = {
  showCash?: boolean;
  cashDue?: number;
  onBack: () => void;
  onComplete: (cashReceived?: number) => void;
  onCustomerUnavailable: () => void;
};

function moneyWords(amount: number): string {
  return `J$${amount.toFixed(2)}`;
}

export function ConfirmHandoffPage({
  showCash = false,
  cashDue = 0,
  onBack,
  onComplete,
  onCustomerUnavailable,
}: ConfirmHandoffPageProps) {
  const [cash, setCash] = useState('');
  const received = Number(cash);
  const due = Math.max(0, cashDue);
  let cashWords = 'Enter what the customer handed you.';
  if (cash.trim() && Number.isFinite(received)) {
    if (received <= 0) cashWords = 'The customer refused to pay. They still owe this order.';
    else if (received + 0.009 < due) cashWords = `Short by ${moneyWords(due - received)}. You keep your full share. The customer still owes the rest.`;
    else if (received > due + 0.009) cashWords = `Give ${moneyWords(received - due)} change.`;
    else cashWords = 'Exact amount. No change.';
  }
  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col">
      <header className="bg-surface shadow-sm fixed top-0 w-full z-50 flex justify-between items-center px-[var(--spacing-edge)] h-14 pt-safe safe-x">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="p-2 -ml-2 rounded-full hover:bg-surface-container-high active:scale-95 text-on-surface"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-xl font-bold text-primary">Roam Rush Courier</h1>
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
          {showCash && (
            <div className="w-full text-left space-y-3">
              <p className="text-base text-on-surface">Amount due {moneyWords(due)}</p>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-on-surface">Amount received</span>
                <input
                  inputMode="decimal"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-14 rounded-lg border border-outline-variant bg-surface px-4 text-2xl"
                />
              </label>
              <p className="text-sm text-on-surface">{cashWords}</p>
              <div className="flex gap-2">
                <button type="button" className="min-h-11 flex-1 rounded-lg border border-outline-variant text-sm font-semibold" onClick={() => setCash(due.toFixed(2))}>
                  No change
                </button>
                <button type="button" className="min-h-11 flex-1 rounded-lg border border-outline-variant text-sm font-semibold" onClick={() => setCash('0')}>
                  Refused
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onCustomerUnavailable}
            className="min-h-11 text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-1 active:opacity-70"
          >
            <MaterialIcon name="help" className="text-base" />
            Customer not available?
          </button>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.04)] px-[var(--spacing-edge)] pt-4 pb-safe z-50">
        <button
          type="button"
          onClick={() => onComplete(cash.trim() ? Number(cash) : undefined)}
          className="w-full max-w-md mx-auto h-14 bg-primary text-on-primary rounded-lg text-xl font-semibold flex items-center justify-center shadow-primary active:scale-[0.98] gap-2"
        >
          <MaterialIcon name="check_circle" />
          Complete Delivery
        </button>
      </div>
    </div>
  );
}
