import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  BUSY_ZONES_MAP,
  MOCK_ACTIVE_PROMOTION,
  MOCK_UPCOMING_PEAK_PAY,
  MOCK_WEEKEND_CHALLENGE,
  formatCountdown,
  formatJmd,
} from '@/lib/mockPromotions';

type PromotionsPageProps = {
  onBack: () => void;
};

export function PromotionsPage({ onBack }: PromotionsPageProps) {
  const promo = MOCK_ACTIVE_PROMOTION;
  const challenge = MOCK_WEEKEND_CHALLENGE;
  const [countdown, setCountdown] = useState(promo.endsInSeconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const progressPercent = Math.round((challenge.completed / challenge.total) * 100);

  return (
    <div className="fixed inset-0 z-[65] bg-background flex flex-col overflow-hidden">
      <header className="sticky top-0 bg-surface z-40 shadow-sm pt-safe shrink-0">
        <div className="flex items-center justify-between px-[var(--spacing-edge)] h-14">
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="p-2 -ml-2 text-primary rounded-full hover:bg-surface-container-low active:scale-95"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <span className="text-sm font-semibold text-primary">Promotions</span>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] pt-6 pb-24 space-y-8 max-w-3xl mx-auto w-full">
        <div>
          <h1 className="text-[28px] font-bold text-on-surface">Promotions</h1>
          <p className="text-base text-muted mt-2">Boost your earnings in high-demand areas.</p>
        </div>

        <section>
          <div className="relative bg-surface rounded-xl p-4 shadow-soft border border-surface-variant overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-tertiary-container" />
            <div className="flex items-start justify-between gap-3">
              <div className="pl-2 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {promo.emoji && <span className="text-xl">{promo.emoji}</span>}
                  <h3 className="text-xl font-semibold text-on-surface">{promo.title}</h3>
                </div>
                <p className="text-2xl font-semibold text-primary mt-1">
                  {promo.amountLabel}{' '}
                  {promo.amountSuffix && (
                    <span className="text-sm text-muted font-normal">{promo.amountSuffix}</span>
                  )}
                </p>
                <p className="text-sm text-on-surface-variant mt-2">{promo.schedule}</p>
              </div>
              <div className="bg-error-container text-on-error-container px-3 py-1.5 rounded-full flex flex-col items-center min-w-[80px] shrink-0">
                <span className="text-[11px] uppercase tracking-wider opacity-80">Ends In</span>
                <span className="text-xl font-bold">{formatCountdown(countdown)}</span>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-on-surface mb-4">Weekend Challenge</h2>
          <div className="bg-surface rounded-xl p-4 shadow-soft border border-surface-variant">
            <div className="flex justify-between items-end mb-4 gap-3">
              <div>
                <h3 className="text-base font-semibold text-on-surface">{challenge.goal}</h3>
                <p className="text-sm text-muted mt-1">{challenge.schedule}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xl font-bold text-success">J${formatJmd(challenge.bonus)}</span>
                <p className="text-[11px] text-muted uppercase tracking-wider">Bonus</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold uppercase tracking-wide mb-2">
                <span className="text-primary">{challenge.completed} Completed</span>
                <span className="text-muted">{challenge.total - challenge.completed} Remaining</span>
              </div>
              <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-on-surface">Busy Zones</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-tertiary-container opacity-50" />
                <span className="text-[11px] text-muted">Busy</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-tertiary" />
                <span className="text-[11px] text-muted">Very Busy</span>
              </div>
            </div>
          </div>
          <div className="relative w-full h-60 rounded-xl overflow-hidden shadow-sm border border-surface-variant">
            <div
              className="w-full h-full bg-cover bg-center"
              style={{ backgroundImage: `url('${BUSY_ZONES_MAP}')` }}
            />
            <div className="absolute bottom-3 right-3 bg-surface/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-surface-variant/50">
              <span className="text-[11px] text-on-surface font-medium flex items-center gap-1">
                <MaterialIcon name="my_location" className="text-sm" />
                Kingston
              </span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-on-surface mb-4">Upcoming Peak Pay</h2>
          <div className="bg-surface rounded-xl shadow-soft border border-surface-variant overflow-hidden divide-y divide-surface-variant">
            {MOCK_UPCOMING_PEAK_PAY.map((item) => (
              <div
                key={item.id}
                className="p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant">
                    <MaterialIcon name={item.icon} />
                  </div>
                  <div>
                    <h4 className="text-base font-medium text-on-surface">{item.title}</h4>
                    <p className="text-sm text-muted">{item.schedule}</p>
                  </div>
                </div>
                <span className="text-xl font-semibold text-primary">+J${item.amount}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="text-sm text-muted flex items-center justify-center gap-2 pb-4">
          <MaterialIcon name="info" className="text-lg" />
          Peak pay applies automatically to offers in busy zones
        </p>
      </main>
    </div>
  );
}
