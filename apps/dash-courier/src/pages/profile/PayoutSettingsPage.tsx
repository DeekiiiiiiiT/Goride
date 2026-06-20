import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import type { PayoutSchedule } from '@/lib/mockSettings';

type PayoutSettingsPageProps = {
  onBack: () => void;
};

const SCHEDULE_OPTIONS: {
  id: PayoutSchedule;
  title: string;
  fee: string;
  feeTone?: 'success';
  description: string;
  bolt?: boolean;
}[] = [
  {
    id: 'weekly',
    title: 'Weekly',
    fee: 'Free',
    feeTone: 'success',
    description: 'Deposited every Tuesday. Takes 2-3 business days.',
  },
  {
    id: 'daily',
    title: 'Daily',
    fee: '$0.50 fee',
    description: 'Deposited at the end of each day. Takes 1-2 business days.',
  },
  {
    id: 'instant',
    title: 'Instant',
    fee: '$1.99 fee',
    description: 'Available immediately to your linked debit card.',
    bolt: true,
  },
];

export function PayoutSettingsPage({ onBack }: PayoutSettingsPageProps) {
  const [schedule, setSchedule] = useState<PayoutSchedule>('weekly');

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Payout Settings" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-8 max-w-2xl mx-auto w-full space-y-6">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-on-background">Payout Method</h2>
          <div className="bg-surface rounded-xl p-4 shadow-soft border border-surface-variant flex items-center justify-between relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
            <div className="flex items-center gap-4 ml-1 min-w-0">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary shrink-0">
                <MaterialIcon name="account_balance" filled />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-on-background">
                    Bank account ending in ****4521
                  </h3>
                  <span className="bg-primary-container text-on-primary-container text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Primary
                  </span>
                </div>
                <p className="text-sm text-muted mt-1">Chase Checking</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Edit payment method"
              className="p-2 rounded-full hover:bg-surface-container text-muted shrink-0"
            >
              <MaterialIcon name="more_vert" />
            </button>
          </div>
          <button
            type="button"
            className="w-full min-h-14 border border-outline border-dashed rounded-xl flex items-center justify-center gap-2 text-primary font-medium hover:bg-surface-container-low active:scale-[0.98] transition-all"
          >
            <MaterialIcon name="add" />
            Add payment method
          </button>
        </section>

        <hr className="border-surface-variant" />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-on-background">Payout Schedule</h2>
            <p className="text-sm text-muted mt-1">Choose how often you get paid.</p>
          </div>
          <div className="space-y-2">
            {SCHEDULE_OPTIONS.map((option) => {
              const selected = schedule === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSchedule(option.id)}
                  className={`w-full text-left bg-surface border rounded-xl p-4 flex items-start gap-4 transition-all shadow-sm hover:border-outline-variant ${
                    selected ? 'border-primary bg-surface-container-low' : 'border-surface-variant'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                      selected ? 'border-primary' : 'border-outline-variant'
                    }`}
                  >
                    {selected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-on-background">{option.title}</h3>
                        {option.bolt && (
                          <MaterialIcon name="bolt" className="text-warning text-xl" filled />
                        )}
                      </div>
                      <span
                        className={`text-sm font-medium shrink-0 ${
                          option.feeTone === 'success' ? 'text-success' : 'text-on-background'
                        }`}
                      >
                        {option.fee}
                      </span>
                    </div>
                    <p className="text-sm text-muted mt-1">{option.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <hr className="border-surface-variant" />

        <section className="space-y-4">
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 bg-surface rounded-xl shadow-soft border border-surface-variant active:scale-[0.98] transition-transform group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                <MaterialIcon name="history" />
              </div>
              <span className="text-base font-medium text-on-background">Payout history</span>
            </div>
            <MaterialIcon name="chevron_right" className="text-muted group-hover:text-primary transition-colors" />
          </button>
          <div className="p-4 bg-surface-container-low rounded-xl border border-surface-variant flex items-start gap-4">
            <MaterialIcon name="info" className="text-muted mt-0.5 shrink-0" />
            <div>
              <h4 className="text-base font-semibold text-on-background">Minimum payout threshold</h4>
              <p className="text-sm text-muted mt-1">
                You must have a minimum balance of $5.00 to trigger an automatic or instant payout.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
