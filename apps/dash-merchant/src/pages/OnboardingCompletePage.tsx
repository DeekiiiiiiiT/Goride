import { MaterialIcon } from '../signup/components/MaterialIcon';
import { Merchant } from '../hooks/useMerchant';
import { useAcceptingOrdersToggle } from '../hooks/useAcceptingOrdersToggle';
import { getCustomerListingUrl, markGoLiveComplete } from '../lib/go-live';

interface OnboardingCompletePageProps {
  merchant: Merchant;
  onGoLive: () => void;
}

const SETUP_ITEMS = [
  'Profile complete',
  'Menu added (minimum 5 items)',
  'Business hours set',
  'Bank details confirmed',
] as const;

export default function OnboardingCompletePage({ merchant, onGoLive }: OnboardingCompletePageProps) {
  const { toggleAcceptingOrders, isPending } = useAcceptingOrdersToggle(merchant);

  const handleGoLive = () => {
    toggleAcceptingOrders(true, {
      onSuccess: () => {
        markGoLiveComplete(merchant.id);
        onGoLive();
      },
    });
  };

  const listingUrl = getCustomerListingUrl(merchant.slug);

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface text-on-surface antialiased">
      <div className="onboarding-blob-bg pointer-events-none absolute inset-0 overflow-hidden">
        <div className="onboarding-blob onboarding-blob-1" />
        <div className="onboarding-blob onboarding-blob-2" />
      </div>

      <main className="relative z-10 flex w-full max-w-lg flex-col items-center px-margin-mobile py-xl md:px-margin-tablet">
        <div className="relative mb-md flex h-24 w-24 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest shadow-sm">
          <div
            className="absolute inset-0 animate-ping rounded-full bg-primary-container opacity-10"
            style={{ animationDuration: '3s' }}
          />
          <MaterialIcon name="verified" filled className="text-5xl text-primary-container" />
        </div>

        <h1 className="mb-xs text-center text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
          You&apos;re approved!
        </h1>
        <p className="mb-xl text-center text-body-lg text-on-surface-variant">
          Congratulations, your restaurant is now a Roam Dash Partner.
        </p>

        <div className="onboarding-glass-card mb-xl w-full rounded-xl border border-outline-variant p-md text-left shadow-sm">
          <h2 className="mb-md text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
            Setup Complete
          </h2>
          <ul className="space-y-sm">
            {SETUP_ITEMS.map((item) => (
              <li key={item} className="flex items-start gap-sm">
                <MaterialIcon
                  name="check_circle"
                  filled
                  className="mt-0.5 text-primary-container"
                  size={20}
                />
                <span className="text-body-sm text-on-surface">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex w-full flex-col gap-sm">
          <button
            type="button"
            onClick={handleGoLive}
            disabled={isPending}
            className="flex h-xl w-full items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold uppercase text-on-primary shadow-md transition-all hover:bg-primary-fixed-dim hover:shadow-lg active:scale-95 disabled:opacity-60"
          >
            {isPending ? 'Going live…' : 'Go Live'}
          </button>
          <a
            href={listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-xl items-center justify-center gap-xs text-label-md font-semibold text-primary transition-colors hover:text-primary-fixed-dim"
          >
            <span>Preview your listing</span>
            <MaterialIcon
              name="open_in_new"
              size={16}
              className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </a>
        </div>

        <div className="mt-md flex items-center justify-center gap-xs text-on-surface-variant opacity-80">
          <MaterialIcon name="info" size={16} />
          <p className="text-body-sm">Once live, customers can start ordering</p>
        </div>
      </main>
    </div>
  );
}
