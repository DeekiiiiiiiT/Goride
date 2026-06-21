import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { MOCK_STACKED_SUMMARY } from '@/lib/mockStackedRoute';

type StackedDeliverySummaryPageProps = {
  onBackToDash: () => void;
};

export function StackedDeliverySummaryPage({ onBackToDash }: StackedDeliverySummaryPageProps) {
  const summary = MOCK_STACKED_SUMMARY;

  return (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col overflow-hidden">
      <header className="bg-surface shadow-soft pt-safe shrink-0">
        <div className="flex items-center justify-center h-14 px-[var(--spacing-edge)]">
          <h1 className="text-xl font-bold text-primary">Summary</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] pt-8 pb-32 max-w-lg mx-auto w-full space-y-6">
        <div className="flex flex-col items-center text-center gap-2 pt-4">
          <div className="w-20 h-20 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container mb-2">
            <MaterialIcon name="check_circle" className="text-4xl" filled />
          </div>
          <h2 className="text-2xl font-semibold text-on-background">Multiple Deliveries Complete!</h2>
          <p className="text-base text-on-surface-variant">
            Great job completing your stacked route.
          </p>
        </div>

        <div className="bg-surface rounded-xl shadow-soft p-6 border border-surface-variant relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10" />
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Total Earned
          </p>
          <h3 className="text-[32px] font-bold text-primary tracking-tight mt-1">
            J${summary.totalEarnings.toLocaleString('en-JM')}
          </h3>
          <div className="flex gap-4 pt-4 mt-4 border-t border-surface-variant">
            <div className="flex-1">
              <p className="text-[11px] text-on-surface-variant">Deliveries</p>
              <p className="text-xl font-semibold text-on-background">{summary.deliveries}</p>
            </div>
            <div className="w-px bg-surface-variant" />
            <div className="flex-1 pl-2">
              <p className="text-[11px] text-on-surface-variant">Distance</p>
              <p className="text-xl font-semibold text-on-background">{summary.distanceKm} km</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xl font-semibold text-on-background">Earnings Breakdown</h4>
          {summary.legs.map((leg) => (
            <div
              key={leg.id}
              className="bg-surface rounded-xl shadow-soft p-4 flex items-center justify-between border-l-4 border-primary"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0">
                  <MaterialIcon name="person" filled />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-medium text-on-background">{leg.label}</p>
                  {leg.rating != null ? (
                    <div className="flex items-center text-warning mt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <MaterialIcon key={i} name="star" className="text-sm" filled />
                      ))}
                      <span className="text-xs text-on-surface-variant ml-2">{leg.rating}.0</span>
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface-variant mt-1">Rating pending</p>
                  )}
                </div>
              </div>
              <p className="text-xl font-semibold text-on-background shrink-0 ml-2">
                J${leg.earnings}
              </p>
            </div>
          ))}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface border-t border-surface-variant p-[var(--spacing-edge)] pb-safe shadow-[0_-4px_12px_rgba(0,108,73,0.05)]">
        <button
          type="button"
          onClick={onBackToDash}
          className="w-full h-14 bg-primary text-on-primary rounded-xl text-xl font-semibold active:scale-95 transition-transform shadow-md max-w-lg mx-auto block"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
