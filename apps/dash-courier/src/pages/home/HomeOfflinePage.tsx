import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { loadSignupDraft } from '@/lib/signupDraft';

type HomeOfflinePageProps = {
  onGoOnline: () => void;
  courierName?: string;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomeOfflinePage({ onGoOnline, courierName }: HomeOfflinePageProps) {
  const draft = loadSignupDraft();
  const displayName = courierName ?? draft.displayName?.split(' ')[0] ?? draft.fullName?.split(' ')[0] ?? 'Courier';

  return (
    <main className="max-w-md mx-auto px-[var(--spacing-edge)] pt-[calc(56px+env(safe-area-inset-top)+24px)] pb-24 flex flex-col gap-6">
      <section className="flex justify-between items-center">
        <div>
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-on-background">
            {getGreeting()}, {displayName}
          </h1>
          <p className="text-base text-muted mt-1">Ready to start earning?</p>
        </div>
        <div className="w-12 h-12 rounded-full overflow-hidden shadow-sm border-2 border-surface shrink-0">
          <img
            src="/images/courier-avatar.png"
            alt="Your profile"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      </section>

      <section className="bg-surface rounded-xl p-8 flex flex-col items-center text-center shadow-soft mt-4">
        <div className="w-24 h-24 bg-surface-container-low rounded-full flex items-center justify-center mb-6">
          <MaterialIcon name="electric_scooter" className="text-4xl text-muted opacity-50" />
        </div>
        <h2 className="text-xl font-semibold text-on-background mb-2">You&apos;re offline</h2>
        <p className="text-sm text-muted mb-8 max-w-[200px]">
          Go online to start receiving delivery offers.
        </p>
        <button
          type="button"
          onClick={onGoOnline}
          className="w-full h-14 bg-primary text-on-primary font-semibold text-xl rounded-full flex items-center justify-center gap-2 shadow-[0_6px_12px_rgba(16,185,129,0.1)] hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <MaterialIcon name="power_settings_new" />
          Go Online
        </button>
      </section>

      <section className="grid grid-cols-2 gap-4 mt-2">
        <div className="bg-surface rounded-xl p-4 shadow-soft flex flex-col gap-2">
          <div className="flex items-center gap-2 text-muted mb-1">
            <MaterialIcon name="payments" className="text-[20px]" />
            <span className="text-xs font-semibold uppercase tracking-wide">Today&apos;s Earnings</span>
          </div>
          <div className="text-[28px] leading-9 font-bold text-on-background">J$0.00</div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-surface rounded-xl p-4 shadow-soft flex flex-col gap-2">
            <div className="flex items-center gap-2 text-muted mb-1">
              <MaterialIcon name="local_shipping" className="text-[20px]" />
              <span className="text-xs font-semibold uppercase tracking-wide">Deliveries</span>
            </div>
            <div className="text-[28px] leading-9 font-bold text-on-background">0</div>
          </div>
          <div className="bg-surface-bright rounded-xl p-3 border border-outline-variant flex items-center justify-between">
            <span className="text-xs font-semibold text-on-surface-variant">Acceptance Rate</span>
            <span className="inline-flex items-center gap-1 bg-surface-container-low text-primary px-2 py-1 rounded-full text-xs font-semibold">
              <MaterialIcon name="verified" className="text-[14px]" />
              92%
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
