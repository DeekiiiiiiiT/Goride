import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { MOCK_DASH_SUMMARY, formatJmd } from '@/lib/mockPromotions';

type DashSummaryPageProps = {
  onEndDash: () => void;
  onStayOnline: () => void;
};

export function DashSummaryPage({ onEndDash, onStayOnline }: DashSummaryPageProps) {
  const summary = MOCK_DASH_SUMMARY;

  return (
    <div className="fixed inset-0 z-[65] bg-background flex flex-col overflow-hidden">
      <main className="flex-1 w-full max-w-[480px] mx-auto px-[var(--spacing-edge)] pt-8 pb-44 overflow-y-auto">
        <header className="mb-6">
          <h1 className="text-[28px] font-bold text-on-background mb-1">Dash Summary</h1>
          <div className="flex items-center gap-1">
            <MaterialIcon name="emoji_events" className="text-primary text-xl" filled />
            <p className="text-base text-primary font-medium">Great work today!</p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 bg-primary-container rounded-xl p-6 relative overflow-hidden shadow-[0_4px_20px_rgba(0,108,73,0.08)] flex flex-col justify-between min-h-[140px]">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-surface/10 rounded-full blur-2xl" />
            <div className="absolute -left-4 -bottom-4 w-24 h-24 bg-surface/10 rounded-full blur-xl" />
            <div className="relative z-10 flex items-start justify-between">
              <span className="text-sm text-on-primary-container/80 uppercase tracking-wider font-semibold">
                Total Earned
              </span>
              <div className="w-10 h-10 rounded-full bg-surface/20 flex items-center justify-center backdrop-blur-sm">
                <MaterialIcon name="payments" className="text-on-primary-container" />
              </div>
            </div>
            <div className="relative z-10 mt-4">
              <span className="text-[28px] font-bold text-on-primary-container tracking-tight">
                J${formatJmd(summary.totalEarned)}
              </span>
            </div>
          </div>

          <div className="bg-surface rounded-xl p-4 shadow-soft border border-surface-variant/50 flex flex-col justify-between min-h-[120px]">
            <MaterialIcon name="local_mall" className="text-muted text-xl mb-2" />
            <div>
              <p className="text-xl font-semibold text-on-surface mb-1">{summary.deliveries}</p>
              <p className="text-[11px] text-muted uppercase tracking-wider">Deliveries</p>
            </div>
          </div>

          <div className="bg-surface rounded-xl p-4 shadow-soft border border-surface-variant/50 flex flex-col justify-between min-h-[120px]">
            <MaterialIcon name="directions_bike" className="text-muted text-xl mb-2" />
            <div>
              <p className="text-xl font-semibold text-on-surface mb-1">{summary.activeTime}</p>
              <p className="text-[11px] text-muted uppercase tracking-wider">Active Time</p>
            </div>
          </div>

          <div className="col-span-2 bg-surface-container-lowest rounded-xl p-4 shadow-soft border border-surface-variant/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center">
                <MaterialIcon name="timer" className="text-muted text-xl" />
              </div>
              <div>
                <p className="text-[11px] text-muted uppercase tracking-wider mb-0.5">Online Time</p>
                <p className="text-xl font-semibold text-on-surface">{summary.onlineTime}</p>
              </div>
            </div>
            <span className="text-[11px] text-success bg-success/10 px-2 py-1 rounded-full font-medium">
              {summary.activePercent}% Active
            </span>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface/95 backdrop-blur-md border-t border-surface-variant pt-4 pb-safe px-[var(--spacing-edge)] z-50 shadow-[0_-8px_24px_rgba(0,0,0,0.04)]">
        <div className="max-w-[480px] mx-auto flex flex-col gap-2">
          <button
            type="button"
            onClick={onEndDash}
            className="w-full min-h-14 bg-primary text-on-primary rounded-xl text-xs font-semibold uppercase tracking-wide flex items-center justify-center shadow-primary active:scale-[0.98] transition-transform"
          >
            End Dash
          </button>
          <button
            type="button"
            onClick={onStayOnline}
            className="w-full min-h-14 bg-transparent border-2 border-outline-variant text-on-surface rounded-xl text-xs font-semibold uppercase tracking-wide flex items-center justify-center active:bg-surface-variant/50 transition-colors"
          >
            Stay Online
          </button>
        </div>
      </div>
    </div>
  );
}
