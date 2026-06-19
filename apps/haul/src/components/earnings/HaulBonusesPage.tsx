import React from 'react';
import { BONUS_POTENTIAL_MINOR, BONUS_WEEKEND_PROGRESS, SURGE_MAP } from '../../lib/haulBonuses';
import { HaulSubpageHeader } from '../profile/HaulSubpageHeader';

type Props = {
  onBack: () => void;
  onViewLoads?: () => void;
};

function formatJmd(minor: number): string {
  return `J$${Math.round(minor / 100).toLocaleString()}`;
}

export function HaulBonusesPage({ onBack, onViewLoads }: Props) {
  const pct = (BONUS_WEEKEND_PROGRESS.completed / BONUS_WEEKEND_PROGRESS.target) * 100;
  const remaining = BONUS_WEEKEND_PROGRESS.target - BONUS_WEEKEND_PROGRESS.completed;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title="Bonuses & Incentives" onBack={onBack} variant="centered-primary" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 pt-[88px] pb-8">
        <section className="relative overflow-hidden rounded-xl border border-[#534434] bg-[#171f33]">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#f59e0b]/20 to-transparent" />
          <div className="relative z-10 flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="mb-2 inline-block rounded bg-[#ffc174] px-2 py-0.5 text-xs font-bold tracking-wider text-[#472a00] uppercase">
                Limited Time
              </span>
              <h2 className="text-4xl font-extrabold text-[#ffc174]">EARN EXTRA THIS WEEKEND</h2>
              <p className="mt-1 text-[#d8c3ad]">Complete specific targets to unlock high-value bonuses.</p>
            </div>
            <div className="shrink-0 rounded-lg border border-[#ffc174]/30 bg-[#0b1326] p-4 text-center">
              <span className="block text-sm text-[#d8c3ad]">Potential Earnings Up To</span>
              <span className="text-2xl font-bold text-[#56e5a9]">{formatJmd(BONUS_POTENTIAL_MINOR)}</span>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-12">
          <div className="flex flex-col rounded-xl border border-[#534434] bg-[#171f33] p-6 md:col-span-7">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f59e0b]/20 text-[#ffc174]">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                    military_tech
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#dae2fd]">Weekend Warrior</h3>
                  <p className="text-sm text-[#d8c3ad]">Complete 5 jobs this weekend</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-[#ffc174]">{formatJmd(BONUS_WEEKEND_PROGRESS.bonusMinor)}</span>
                <span className="block text-sm text-[#56e5a9]">Bonus</span>
              </div>
            </div>
            <div className="mt-auto pt-4">
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-[#d8c3ad]">Progress</span>
                <span className="text-[#dae2fd]">
                  {BONUS_WEEKEND_PROGRESS.completed}{' '}
                  <span className="text-[#d8c3ad]">/ {BONUS_WEEKEND_PROGRESS.target} Completed</span>
                </span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full border border-[#534434]/30 bg-[#0b1326]">
                <div
                  className="h-full rounded-full bg-[#ffc174] shadow-[0_0_10px_rgba(255,193,116,0.4)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 flex items-center gap-1 text-sm text-[#d8c3ad]">
                <span className="material-symbols-outlined text-base text-[#56e5a9]">check_circle</span>
                {remaining} more hauls to unlock bonus.
              </p>
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-[#534434] bg-[#171f33] p-6 md:col-span-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a6e0]/20 text-[#7bd0ff]">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  schedule
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#dae2fd]">Peak Hours</h3>
                <p className="text-sm text-[#d8c3ad]">High demand multiplier</p>
              </div>
            </div>
            <div className="mb-3 flex items-center justify-between rounded-lg border border-[#534434] bg-[#0b1326] p-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#d8c3ad]">update</span>
                <span className="font-semibold text-[#dae2fd]">2:00 PM - 6:00 PM</span>
              </div>
              <span className="rounded border border-[#56e5a9]/30 bg-[#30c88f]/20 px-2 py-0.5 text-sm font-bold text-[#56e5a9]">
                1.5x
              </span>
            </div>
            <p className="mb-4 flex items-center gap-2 text-[#d8c3ad]">
              <span className="material-symbols-outlined text-[#ffc174]">location_on</span>
              High demand specifically in the <strong className="text-[#dae2fd]">Kingston area</strong> today.
            </p>
            <button
              type="button"
              onClick={onViewLoads}
              className="mt-auto flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#ffc174] text-sm font-medium text-[#ffc174] hover:bg-[#ffc174]/10"
            >
              View Eligible Loads
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
          </div>
        </div>

        <section className="rounded-xl border border-[#534434] bg-[#171f33] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-[#dae2fd]">
              <span className="material-symbols-outlined text-[#ffc174]">local_fire_department</span>
              Active Surge Zones
            </h3>
            <span className="flex items-center gap-1 text-sm text-[#d8c3ad]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#56e5a9]" />
              Live Updates
            </span>
          </div>
          <div className="relative h-[250px] overflow-hidden rounded-lg border border-[#534434] bg-[#0b1326] md:h-[320px]">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity"
              style={{ backgroundImage: `url('${SURGE_MAP}')` }}
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,193,116,0.3),_rgba(11,19,38,0.9))]" />
            <button
              type="button"
              className="absolute top-4 left-4 flex h-11 w-11 items-center justify-center rounded-lg border border-[#534434] bg-[#171f33]/90 text-[#dae2fd] shadow-lg backdrop-blur"
              aria-label="My location"
            >
              <span className="material-symbols-outlined">my_location</span>
            </button>
            <div className="absolute right-4 bottom-4 rounded-lg border border-[#534434] bg-[#171f33]/90 p-2 backdrop-blur">
              <div className="flex flex-col gap-1 text-xs text-[#dae2fd]">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#ffc174] blur-[1px]" />
                  High Demand (2.0x)
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-[#ffc174]/50" />
                  Moderate (1.5x)
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
