import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  formatThresholdJmd,
  readPayoutPrefs,
  writePayoutPrefs,
  type HaulPayoutPrefs,
  type PayoutSchedule,
} from '../../lib/haulPayoutPrefs';
import { HaulSubpageHeader } from '../profile/HaulSubpageHeader';

type Props = {
  onBack: () => void;
  onViewTransactions?: () => void;
};

function RadioOption({
  selected,
  onSelect,
  title,
  subtitle,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  title: React.ReactNode;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center rounded-lg border p-4 text-left transition-colors ${
        selected
          ? 'border-[#ffc174] bg-[#2d3449]'
          : 'border-[#534434] bg-[#2d3449] hover:border-[#ffc174]/50'
      }`}
    >
      <div
        className={`mr-4 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? 'border-[#ffc174]' : 'border-[#534434]'
        }`}
      >
        {selected ? <div className="h-2.5 w-2.5 rounded-full bg-[#ffc174]" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-[#dae2fd]">{title}</div>
          {badge}
        </div>
        <p className="text-sm text-[#d8c3ad]">{subtitle}</p>
      </div>
    </button>
  );
}

export function HaulPayoutSettingsPage({ onBack, onViewTransactions }: Props) {
  const [prefs, setPrefs] = useState<HaulPayoutPrefs>(() => readPayoutPrefs());

  const save = (next: HaulPayoutPrefs) => {
    setPrefs(next);
    writePayoutPrefs(next);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title="RoamHaul" onBack={onBack} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-[88px] pb-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-[#dae2fd]">Payout Settings</h2>
          <p className="mt-1 text-[#d8c3ad]">Manage how and when you get paid.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-7">
            <section className="flex flex-col gap-4 rounded-xl border border-[#534434] bg-[#171f33] p-4">
              <h3 className="text-lg font-semibold text-[#dae2fd]">Current Method</h3>
              <div className="flex items-center justify-between rounded-lg border border-[#534434] bg-[#2d3449] p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#534434] bg-[#0b1326]">
                    <span className="material-symbols-outlined text-[#ffc174]">account_balance</span>
                  </div>
                  <div>
                    <p className="font-semibold text-[#dae2fd]">{prefs.bankName}</p>
                    <p className="text-sm text-[#d8c3ad]">•••• {prefs.bankLast4}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toast.info('Bank editing coming soon')}
                  className="px-2 py-1 text-sm font-medium text-[#ffc174]"
                >
                  Edit
                </button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => toast.info('Bank linking coming soon')}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-[#ffc174] text-sm font-medium text-[#ffc174] hover:bg-[#ffc174]/10"
                >
                  <span className="material-symbols-outlined text-xl">add_circle</span>
                  Add Bank Account
                </button>
                <button
                  type="button"
                  onClick={() => toast.info('Debit card linking coming soon')}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-[#ffc174] text-sm font-medium text-[#ffc174] hover:bg-[#ffc174]/10"
                >
                  <span className="material-symbols-outlined text-xl">credit_card</span>
                  Add Debit Card
                </button>
              </div>
            </section>

            <button
              type="button"
              onClick={onViewTransactions}
              className="group flex items-center justify-between rounded-xl border border-[#534434] bg-[#171f33] p-4 transition-colors hover:border-[#ffc174]"
            >
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-[#d8c3ad] group-hover:text-[#ffc174]">history</span>
                <span className="text-lg font-semibold text-[#dae2fd]">View Transaction History</span>
              </div>
              <span className="material-symbols-outlined text-[#d8c3ad] group-hover:text-[#ffc174]">chevron_right</span>
            </button>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-5">
            <section className="flex flex-col gap-3 rounded-xl border border-[#534434] bg-[#171f33] p-4">
              <h3 className="text-lg font-semibold text-[#dae2fd]">Payout Schedule</h3>
              <RadioOption
                selected={prefs.schedule === 'weekly'}
                onSelect={() => save({ ...prefs, schedule: 'weekly' })}
                title="Weekly"
                subtitle="No fee. Paid every Tuesday."
              />
              <RadioOption
                selected={prefs.schedule === 'instant'}
                onSelect={() => save({ ...prefs, schedule: 'instant' })}
                title={
                  <span className="flex items-center gap-1">
                    Instant
                    <span
                      className="material-symbols-outlined text-base text-[#ffc174]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      bolt
                    </span>
                  </span>
                }
                subtitle="Funds available immediately."
                badge={
                  <span className="rounded bg-[#ffc174]/20 px-2 py-1 text-xs font-bold text-[#ffc174]">J$150 fee</span>
                }
              />
            </section>

            <section className="flex flex-col gap-3 rounded-xl border border-[#534434] bg-[#171f33] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#dae2fd]">Minimum Threshold</h3>
                <span className="text-2xl font-bold text-[#ffc174]">
                  {formatThresholdJmd(prefs.minimumThresholdMinor)}
                </span>
              </div>
              <p className="text-sm text-[#d8c3ad]">Hold payouts until this balance is reached.</p>
              <input
                type="range"
                min={0}
                max={10000}
                step={500}
                value={prefs.minimumThresholdMinor / 100}
                onChange={(e) =>
                  save({ ...prefs, minimumThresholdMinor: Number(e.target.value) * 100 })
                }
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[#2d3449] accent-[#ffc174]"
              />
              <div className="flex justify-between px-1 text-xs text-[#d8c3ad]">
                <span>J$0</span>
                <span>J$5,000</span>
                <span>J$10k+</span>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
