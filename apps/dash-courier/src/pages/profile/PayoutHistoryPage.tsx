import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import {
  MOCK_PAYOUT_HISTORY,
  formatPayoutJmd,
  payoutStatusLabel,
  type PayoutRecord,
  type PayoutStatus,
} from '@/lib/mockPayoutHistory';

type PayoutHistoryPageProps = {
  onBack: () => void;
};

const STATUS_STYLES: Record<
  PayoutStatus,
  { icon: string; tone: string; bg: string }
> = {
  deposited: {
    icon: 'check_circle',
    tone: 'text-success',
    bg: 'bg-success/10',
  },
  pending: {
    icon: 'schedule',
    tone: 'text-warning',
    bg: 'bg-warning/10',
  },
  failed: {
    icon: 'error',
    tone: 'text-error',
    bg: 'bg-error/10',
  },
};

function PayoutRow({ record }: { record: PayoutRecord }) {
  const style = STATUS_STYLES[record.status];

  return (
    <div className="bg-surface rounded-xl p-4 shadow-soft border border-surface-variant flex items-center gap-4">
      <div
        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}
      >
        <MaterialIcon name={style.icon} className={`text-xl ${style.tone}`} filled />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-base font-semibold text-on-surface">
            J${formatPayoutJmd(record.amount)}
          </p>
          <p className="text-[11px] text-muted shrink-0">{record.timeLabel}</p>
        </div>
        <p className="text-sm text-muted mt-0.5">
          {record.dateLabel} · {record.schedule}
        </p>
        <p className="text-sm text-muted truncate">{record.method}</p>
      </div>
      <span
        className={`text-[11px] font-semibold uppercase tracking-wide shrink-0 ${style.tone}`}
      >
        {payoutStatusLabel(record.status)}
      </span>
    </div>
  );
}

export function PayoutHistoryPage({ onBack }: PayoutHistoryPageProps) {
  return (
    <div className="fixed inset-0 z-[75] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Payout History" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-8 max-w-2xl mx-auto w-full space-y-6">
        {MOCK_PAYOUT_HISTORY.map((group) => (
          <section key={group.month} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted sticky top-0 bg-background/90 backdrop-blur py-2 z-10">
              {group.month}
            </h2>
            <div className="flex flex-col gap-3">
              {group.items.map((record) => (
                <PayoutRow key={record.id} record={record} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
