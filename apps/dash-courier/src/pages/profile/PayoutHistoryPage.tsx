import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { fetchCourierEarnings } from '@/lib/courierApi';
import { formatPayoutJmd, payoutStatusLabel, type PayoutStatus } from '@/lib/mockPayoutHistory';

type PayoutHistoryPageProps = {
  onBack: () => void;
};

type PayoutRow = {
  id: string;
  amount: number;
  status: PayoutStatus;
  periodLabel: string;
  createdLabel: string;
};

const STATUS_STYLES: Record<PayoutStatus, { icon: string; tone: string; bg: string }> = {
  deposited: { icon: 'check_circle', tone: 'text-success', bg: 'bg-success/10' },
  pending: { icon: 'schedule', tone: 'text-warning', bg: 'bg-warning/10' },
  failed: { icon: 'error', tone: 'text-error', bg: 'bg-error/10' },
};

function mapStatus(raw: string): PayoutStatus {
  if (raw === 'paid' || raw === 'deposited') return 'deposited';
  if (raw === 'failed' || raw === 'void') return 'failed';
  return 'pending';
}

export function PayoutHistoryPage({ onBack }: PayoutHistoryPageProps) {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const data = await fetchCourierEarnings('month');
      if (cancelled) return;
      const payouts = (data?.payouts || []) as Array<Record<string, unknown>>;
      setRows(
        payouts.map((p) => ({
          id: String(p.id),
          amount: Number(p.amount || 0),
          status: mapStatus(String(p.status || 'pending')),
          periodLabel:
            p.period_start && p.period_end
              ? `${p.period_start} → ${p.period_end}`
              : 'Period',
          createdLabel: p.created_at
            ? new Date(String(p.created_at)).toLocaleString()
            : '',
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[75] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Payout History" onBack={onBack} />
      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-8 max-w-2xl mx-auto w-full space-y-3">
        {loading && <p className="text-sm text-muted">Loading…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="payments"
            title="No payouts yet"
            description="When a payout period is closed, it will show up here."
          />
        )}
        {rows.map((record) => {
          const style = STATUS_STYLES[record.status];
          return (
            <div
              key={record.id}
              className="bg-surface rounded-xl p-4 shadow-soft border border-surface-variant flex items-center gap-4"
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}>
                <MaterialIcon name={style.icon} className={`text-xl ${style.tone}`} filled />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-base font-semibold text-on-surface">
                    J${formatPayoutJmd(record.amount)}
                  </p>
                  <p className="text-[11px] text-muted shrink-0">{record.createdLabel}</p>
                </div>
                <p className="text-sm text-muted mt-0.5">{record.periodLabel}</p>
              </div>
              <span className={`text-[11px] font-semibold uppercase tracking-wide shrink-0 ${style.tone}`}>
                {payoutStatusLabel(record.status)}
              </span>
            </div>
          );
        })}
      </main>
    </div>
  );
}
