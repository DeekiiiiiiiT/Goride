import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { loadCourierProfile, type CourierProfileRow } from '@/lib/courierProfileService';

type RatingsStatsPageProps = {
  onBack: () => void;
};

export function RatingsStatsPage({ onBack }: RatingsStatsPageProps) {
  const [profile, setProfile] = useState<CourierProfileRow | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(false);
    const row = await loadCourierProfile();
    setLoading(false);
    if (!row) {
      setError(true);
      return;
    }
    setProfile(row);
  };

  useEffect(() => {
    void load();
  }, []);

  if (error) {
    return (
      <div className="fixed inset-0 z-[70] bg-background">
        <SubPageHeader title="Ratings & Stats" onBack={onBack} />
        <ErrorScreen variant="server" onPrimary={() => void load()} onSecondary={onBack} fullScreen={false} />
      </div>
    );
  }

  const rating = Number(profile?.rating ?? 0);
  const acceptance = Number(profile?.acceptance_rate_pct ?? 0);
  const completion = Number(profile?.completion_rate_pct ?? 0);
  const deliveries = Number(profile?.total_deliveries ?? 0);
  const filledStars = Math.min(5, Math.floor(rating));
  const half = rating - filledStars >= 0.5;

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Ratings & Stats" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-4 pb-8 space-y-6">
        {loading && <p className="text-sm text-muted">Loading stats…</p>}
        <section>
          <div className="bg-surface rounded-xl shadow-soft p-6 flex flex-col items-center">
            <div className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-2">
              Overall Rating
            </div>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-[28px] leading-9 font-bold text-on-background">
                {rating.toFixed(2)}
              </span>
              <span className="text-sm text-muted pb-1">/ 5</span>
            </div>
            <div className="flex text-warning mb-4">
              {Array.from({ length: filledStars }).map((_, i) => (
                <MaterialIcon key={i} name="star" filled />
              ))}
              {half && <MaterialIcon name="star_half" filled />}
              {Array.from({ length: Math.max(0, 5 - filledStars - (half ? 1 : 0)) }).map((_, i) => (
                <MaterialIcon key={`e-${i}`} name="star" />
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          {[
            {
              label: 'Acceptance Rate',
              value: `${acceptance.toFixed(0)}%`,
              target: 'Target: 80%+',
              icon: 'check_circle',
              accent: true,
            },
            {
              label: 'Completion Rate',
              value: `${completion.toFixed(0)}%`,
              target: 'Target: 95%+',
              icon: 'task_alt',
              accent: true,
            },
            {
              label: 'Total Deliveries',
              value: String(deliveries),
              icon: 'local_mall',
              accent: false,
            },
            {
              label: 'Account Status',
              value: profile?.status ?? '—',
              icon: 'person',
              accent: false,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-surface rounded-xl shadow-soft p-4 flex flex-col justify-between min-h-[120px] relative overflow-hidden ${
                stat.accent ? 'border-l-4 border-success' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant max-w-[80%]">
                  {stat.label}
                </h3>
                <MaterialIcon
                  name={stat.icon}
                  className={`${stat.accent ? 'text-success' : 'text-primary'} opacity-20 text-[32px] absolute -right-2 -top-2`}
                />
              </div>
              <div>
                <div className="text-2xl font-semibold text-on-background mt-2 capitalize">{stat.value}</div>
                {stat.target && (
                  <div className="text-[11px] text-muted mt-1 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-success mr-1" />
                    {stat.target}
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
