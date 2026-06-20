import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { MOCK_ORDER_CANCELLATION, formatJmd } from '@/lib/mockPromotions';

type OrderCancelledPageProps = {
  onBackToDash: () => void;
};

export function OrderCancelledPage({ onBackToDash }: OrderCancelledPageProps) {
  const cancellation = MOCK_ORDER_CANCELLATION;

  return (
    <div className="fixed inset-0 z-[80] bg-surface flex flex-col overflow-hidden">
      <main className="flex-1 w-full flex flex-col justify-center items-center px-[var(--spacing-edge)] pb-8 pt-16">
        <div
          className="w-32 h-32 rounded-full bg-error-container flex items-center justify-center mb-8 shadow-[0_8px_32px_rgba(186,26,26,0.15)] animate-pulse"
          style={{ animationDuration: '3s' }}
        >
          <MaterialIcon name="error" className="text-[64px] text-error" filled />
        </div>

        <h1 className="text-[28px] font-bold text-on-surface text-center mb-12">Order Cancelled</h1>

        <div className="w-full max-w-md bg-background rounded-xl p-6 shadow-sm border border-surface-variant flex flex-col gap-4">
          <div className="flex justify-between items-center py-2 border-b border-surface-variant">
            <span className="text-sm text-muted">Cancelled by</span>
            <span className="text-xl font-semibold text-on-surface">{cancellation.cancelledBy}</span>
          </div>
          <div className="flex flex-col gap-1 py-2">
            <span className="text-sm text-muted">Reason</span>
            <span className="text-base text-on-surface">{cancellation.reason}</span>
          </div>
        </div>

        <div className="w-full max-w-md mt-6 bg-surface-container-low border border-outline-variant rounded-xl p-4 flex items-start gap-4 shadow-sm">
          <div className="bg-surface w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm">
            <MaterialIcon name="info" className="text-primary text-xl" />
          </div>
          <p className="text-sm text-on-surface-variant pt-2">
            You&apos;ll receive{' '}
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              J${formatJmd(cancellation.compensation)}
            </span>{' '}
            for your time.
          </p>
        </div>

        <div className="flex-1 min-h-8" />

        <div className="w-full max-w-md pt-6">
          <button
            type="button"
            onClick={onBackToDash}
            className="w-full min-h-14 bg-primary text-on-primary rounded-full text-xs font-semibold uppercase tracking-wider flex justify-center items-center shadow-[0_6px_12px_rgba(0,108,73,0.2)] active:scale-95 transition-transform"
          >
            Back to Dash
          </button>
        </div>
      </main>
    </div>
  );
}
