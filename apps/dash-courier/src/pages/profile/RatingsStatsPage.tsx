import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { MOCK_COURIER_PROFILE } from '@/lib/mockProfile';
import { RATING_DISTRIBUTION, RECENT_FEEDBACK } from '@/lib/mockSettings';

type RatingsStatsPageProps = {
  onBack: () => void;
};

export function RatingsStatsPage({ onBack }: RatingsStatsPageProps) {
  const profile = MOCK_COURIER_PROFILE;
  const feedback = RECENT_FEEDBACK[0];

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Ratings & Stats" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-4 pb-8 space-y-6">
        <section>
          <div className="bg-surface rounded-xl shadow-soft p-6 flex flex-col items-center">
            <div className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-2">
              Overall Rating
            </div>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-[28px] leading-9 font-bold text-on-background">
                {profile.rating.toFixed(2)}
              </span>
              <span className="text-sm text-muted pb-1">/ 5</span>
            </div>
            <div className="flex text-warning mb-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <MaterialIcon key={i} name="star" filled />
              ))}
              <MaterialIcon name="star_half" filled />
            </div>
            <div className="w-full space-y-2 mt-2">
              {RATING_DISTRIBUTION.map((row) => (
                <div key={row.stars} className="flex items-center text-sm">
                  <span className="w-4 text-[11px] text-muted">{row.stars}</span>
                  <div className="flex-1 mx-3 h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div
                      className={`h-full ${row.tone === 'error' ? 'bg-error opacity-80' : 'bg-primary'}`}
                      style={{
                        width: `${row.percent}%`,
                        opacity: row.tone === 'error' ? undefined : 1 - (5 - row.stars) * 0.15,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-[11px] text-muted">{row.percent}%</span>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="mt-4 w-full flex items-center justify-center text-primary text-sm hover:underline"
          >
            <MaterialIcon name="info" className="text-lg mr-1" />
            What affects my rating?
          </button>
        </section>

        <section className="grid grid-cols-2 gap-4">
          {[
            {
              label: 'Acceptance Rate',
              value: `${profile.acceptanceRate}%`,
              target: 'Target: 80%+',
              icon: 'check_circle',
              accent: true,
            },
            {
              label: 'Completion Rate',
              value: `${profile.completionRate}%`,
              target: 'Target: 95%+',
              icon: 'task_alt',
              accent: true,
            },
            { label: 'On-time Rate', value: '94%', icon: 'schedule', accent: false },
            {
              label: 'Total Deliveries',
              value: String(profile.totalDeliveries),
              icon: 'local_mall',
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
                <div className="text-2xl font-semibold text-on-background mt-2">{stat.value}</div>
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

        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-on-background">Recent Feedback</h2>
            <button type="button" className="text-xs font-semibold uppercase tracking-wide text-primary">
              View All
            </button>
          </div>
          {feedback && (
            <div className="bg-surface rounded-xl shadow-soft p-4">
              <div className="flex items-start mb-2">
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary font-semibold mr-2">
                  {feedback.initials}
                </div>
                <div>
                  <div className="text-[11px] text-muted">{feedback.date}</div>
                  <div className="flex text-warning">
                    {Array.from({ length: feedback.stars }).map((_, i) => (
                      <MaterialIcon key={i} name="star" className="text-base" filled />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-sm text-on-surface-variant italic">&ldquo;{feedback.comment}&rdquo;</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
