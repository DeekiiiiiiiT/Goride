import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { fetchActivePromotions, type PeakPromotion } from '@/lib/courierApi';
import { formatJmd } from '@/lib/formatMoney';

type PromotionsPageProps = {
  onBack: () => void;
};

function formatWindow(starts: string, ends: string): string {
  const start = new Date(starts);
  const end = new Date(ends);
  const dayFmt = { weekday: 'short', hour: 'numeric', minute: '2-digit' } as const;
  return `${start.toLocaleString(undefined, dayFmt)} – ${end.toLocaleString(undefined, dayFmt)}`;
}

export function PromotionsPage({ onBack }: PromotionsPageProps) {
  const [promotions, setPromotions] = useState<PeakPromotion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchActivePromotions().then((rows) => {
      setPromotions(rows);
      setLoading(false);
    });
  }, []);

  return (
    <div className="fixed inset-0 z-[65] bg-background flex flex-col overflow-hidden">
      <header className="sticky top-0 bg-surface z-40 shadow-sm pt-safe safe-x shrink-0">
        <div className="flex items-center justify-between px-[var(--spacing-edge)] h-14">
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="p-2 -ml-2 text-primary rounded-full hover:bg-surface-container-low active:scale-95"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <span className="text-sm font-semibold text-primary">Active boosts</span>
          <div className="w-10" aria-hidden />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] pt-6 pb-24 space-y-4 max-w-3xl mx-auto w-full">
        <div>
          <h1 className="text-[28px] font-bold text-on-surface">Peak Pay</h1>
          <p className="text-base text-muted mt-2">
            Extra pay on offers during busy windows. Shown on the offer card when active.
          </p>
        </div>

        {loading && (
          <p className="text-sm text-muted">Loading active boosts…</p>
        )}

        {!loading && promotions.length === 0 && (
          <div className="rounded-xl border border-outline-variant/30 bg-surface p-6 text-center">
            <MaterialIcon name="schedule" className="text-4xl text-muted mb-2" />
            <p className="text-on-surface font-medium">No active boosts right now</p>
            <p className="text-sm text-muted mt-1">Check back during lunch and dinner rush.</p>
          </div>
        )}

        {promotions.map((promo) => (
          <section
            key={promo.id}
            className="relative bg-surface rounded-xl p-4 shadow-soft border border-surface-variant overflow-hidden"
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-tertiary-container" />
            <div className="pl-2">
              <h3 className="text-xl font-semibold text-on-surface">{promo.label}</h3>
              <p className="text-2xl font-semibold text-primary mt-1">
                +{formatJmd(Number(promo.bonus_amount))}
                <span className="text-sm text-muted font-normal ml-1">per delivery</span>
              </p>
              <p className="text-sm text-on-surface-variant mt-2">
                {formatWindow(promo.starts_at, promo.ends_at)}
              </p>
              {promo.all_kingston && (
                <p className="text-xs text-muted mt-2 uppercase tracking-wide">Kingston area</p>
              )}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
