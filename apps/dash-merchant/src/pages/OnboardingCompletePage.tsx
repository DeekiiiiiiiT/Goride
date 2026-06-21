import { useEffect, useState } from 'react';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { Merchant } from '../hooks/useMerchant';
import { useAcceptingOrdersToggle } from '../hooks/useAcceptingOrdersToggle';
import { getCustomerListingUrl, markGoLiveComplete } from '../lib/go-live';
import { fetchApplicationStatus } from '../lib/partner-api';

interface OnboardingCompletePageProps {
  merchant: Merchant;
  onGoLive: () => void;
}

const SETUP_ITEMS = [
  { key: 'profileComplete', label: 'Profile complete' },
  { key: 'menuComplete', label: 'Menu added (minimum 5 items)' },
  { key: 'hoursComplete', label: 'Business hours set' },
  { key: 'bankComplete', label: 'Bank details confirmed' },
] as const;

export default function OnboardingCompletePage({ merchant, onGoLive }: OnboardingCompletePageProps) {
  const { toggleAcceptingOrders, isPending } = useAcceptingOrdersToggle(merchant);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchApplicationStatus()
      .then((res) => setChecklist(res.checklist))
      .finally(() => setLoading(false));
  }, []);

  const requiredComplete = SETUP_ITEMS.every((item) => checklist[item.key]);
  const listingUrl = getCustomerListingUrl(merchant.slug);

  const handleGoLive = () => {
    if (!requiredComplete) return;
    toggleAcceptingOrders(true, {
      onSuccess: () => {
        markGoLiveComplete(merchant.id);
        onGoLive();
      },
    });
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface text-on-surface antialiased">
      <div className="onboarding-blob-bg pointer-events-none absolute inset-0 overflow-hidden">
        <div className="onboarding-blob onboarding-blob-1" />
        <div className="onboarding-blob onboarding-blob-2" />
      </div>

      <main className="relative z-10 flex w-full max-w-lg flex-col items-center px-margin-mobile py-inset-xl md:px-margin-tablet">
        <div className="relative mb-inset-md flex h-24 w-24 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest shadow-sm">
          <div
            className="absolute inset-0 animate-ping rounded-full bg-primary-container opacity-10"
            style={{ animationDuration: '3s' }}
          />
          <MaterialIcon name="verified" filled className="text-5xl text-primary-container" />
        </div>

        <h1 className="mb-inset-xs text-center text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
          You&apos;re approved!
        </h1>
        <p className="mb-inset-xl text-center text-body-lg text-on-surface-variant">
          Congratulations, your restaurant is now a Roam Dash Partner.
        </p>

        <div className="onboarding-glass-card mb-inset-xl w-full rounded-xl border border-outline-variant p-inset-md text-left shadow-sm">
          <h2 className="mb-inset-md text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
            Setup Checklist
          </h2>
          {loading ? (
            <p className="text-body-sm text-on-surface-variant">Loading…</p>
          ) : (
            <ul className="space-y-inset-sm">
              {SETUP_ITEMS.map((item) => {
                const done = checklist[item.key];
                return (
                  <li key={item.key} className="flex items-start gap-inset-sm">
                    <MaterialIcon
                      name={done ? 'check_circle' : 'radio_button_unchecked'}
                      filled={done}
                      className={`mt-0.5 ${done ? 'text-primary-container' : 'text-outline'}`}
                      size={20}
                    />
                    <span className="text-body-sm text-on-surface">{item.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && !requiredComplete && (
            <p className="mt-inset-md text-body-sm text-on-surface-variant">
              Complete all items above before going live.
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-inset-sm">
          <button
            type="button"
            onClick={handleGoLive}
            disabled={isPending || loading || !requiredComplete}
            className="flex h-inset-xl w-full items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold uppercase text-on-primary shadow-md transition-all hover:bg-primary-fixed-dim hover:shadow-lg active:scale-95 disabled:opacity-60"
          >
            Go Live
          </button>
          <a
            href={listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-outline-variant text-label-md font-semibold text-primary transition-colors hover:bg-surface-container-low"
          >
            Preview listing
            <MaterialIcon name="open_in_new" size={18} />
          </a>
        </div>
      </main>
    </div>
  );
}
