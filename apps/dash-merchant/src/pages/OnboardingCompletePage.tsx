import { useEffect, useMemo, useState } from 'react';
import { resolveGoLiveRule, resolveVerticalType } from '@roam/vertical-config';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { Merchant } from '../hooks/useMerchant';
import { useAcceptingOrdersToggle } from '../hooks/useAcceptingOrdersToggle';
import { markGoLiveComplete } from '../lib/go-live';
import { fetchApplicationStatus } from '../lib/partner-api';

interface OnboardingCompletePageProps {
  merchant: Merchant;
  setupInProgress?: boolean;
  onGoLive: () => void;
  onContinueToDashboard: () => void;
  onOpenSetup?: () => void;
  refreshKey?: number;
}

type ChecklistItem = {
  key: string;
  label: string;
};

export default function OnboardingCompletePage({
  merchant,
  setupInProgress = false,
  onGoLive,
  onContinueToDashboard,
  onOpenSetup,
  refreshKey = 0,
}: OnboardingCompletePageProps) {
  const { toggleAcceptingOrders, isPending } = useAcceptingOrdersToggle(merchant);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const goLiveRule = resolveGoLiveRule(merchant.go_live_rule ?? undefined);
  const usesCatalog = goLiveRule === 'catalog_imported' || goLiveRule === 'pos_connected';
  const vertical = resolveVerticalType(merchant.vertical_type);

  const applicationItems: ChecklistItem[] = useMemo(
    () => [
      { key: 'profileComplete', label: 'Profile complete' },
      { key: 'documentsComplete', label: 'Identity documents' },
      { key: 'hoursComplete', label: 'Business hours set' },
    ],
    [],
  );

  const restaurantSetupKey = usesCatalog ? 'catalogComplete' : 'menuComplete';
  const restaurantSetupLabel = usesCatalog ? 'Inventory ready' : 'Restaurant set up';
  const restaurantSetupHint = usesCatalog
    ? 'Upload products so customers can browse and order.'
    : 'Add your menu categories and items so customers can browse and order.';
  const setupButtonLabel = usesCatalog ? 'Set up inventory' : 'Set up your restaurant';

  useEffect(() => {
    setLoading(true);
    void fetchApplicationStatus()
      .then((res) => setChecklist(res.checklist))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const applicationComplete = applicationItems.every((item) => checklist[item.key]);
  const restaurantReady = Boolean(checklist[restaurantSetupKey]);
  const canGoLive = applicationComplete && restaurantReady;

  const progressItems = [...applicationItems, { key: restaurantSetupKey, label: restaurantSetupLabel }];
  const completedCount = progressItems.filter((item) => checklist[item.key]).length;
  const progressPct = progressItems.length
    ? Math.round((completedCount / progressItems.length) * 100)
    : 0;

  const handleGoLive = () => {
    if (!canGoLive) return;
    toggleAcceptingOrders(true, {
      onSuccess: () => {
        markGoLiveComplete(merchant.id);
        onGoLive();
      },
    });
  };

  const verticalBadge =
    vertical === 'grocery'
      ? 'Grocery'
      : vertical === 'pharmacy'
        ? 'Pharmacy'
        : vertical === 'alcohol'
          ? 'Alcohol'
          : vertical === 'convenience'
            ? 'Convenience'
            : null;

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <header className="sticky top-0 z-50 border-b border-outline-variant bg-surface">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-margin-mobile">
          <h1 className="text-title-lg font-semibold text-primary">Roam Dash Partner</h1>
          {verticalBadge && (
            <span className="rounded-full bg-primary-container px-3 py-1 text-label-md text-on-primary-container">
              {verticalBadge}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-margin-mobile py-8 pb-32 md:py-12">
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full bg-primary-container">
            <MaterialIcon name="verified" filled className="text-5xl text-on-primary-container" />
          </div>
          <h2 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
            You&apos;re approved!
          </h2>
          <p className="mx-auto mt-2 max-w-md text-body-lg text-on-surface-variant">
            {restaurantReady
              ? 'Your restaurant is ready. Go live when you want to start accepting orders.'
              : 'Set up your restaurant next, then go live when you are ready to accept orders.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-title-lg font-semibold text-on-surface">Setup progress</h3>
                {!loading && (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-label-md text-primary">
                    {progressPct}% Complete
                  </span>
                )}
              </div>

              {loading ? (
                <p className="text-body-sm text-on-surface-variant">Loading checklist…</p>
              ) : (
                <div className="space-y-6">
                  <section>
                    <p className="mb-3 text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
                      Application
                    </p>
                    <div className="space-y-3">
                      {applicationItems.map((item) => {
                        const done = checklist[item.key];
                        return (
                          <div
                            key={item.key}
                            className="flex items-start gap-4 rounded-lg bg-surface-container-low p-4"
                          >
                            <MaterialIcon
                              name={done ? 'check_circle' : 'radio_button_unchecked'}
                              filled={done}
                              className={`mt-0.5 shrink-0 ${done ? 'text-primary' : 'text-primary-fixed-dim'}`}
                            />
                            <p className="text-title-md text-on-surface">{item.label}</p>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section>
                    <p className="mb-3 text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
                      Restaurant
                    </p>
                    <div
                      className={`flex items-start gap-4 rounded-lg p-4 ${
                        restaurantReady
                          ? 'bg-surface-container-low'
                          : 'border-2 border-primary/20 bg-primary/5'
                      }`}
                    >
                      <MaterialIcon
                        name={restaurantReady ? 'check_circle' : 'radio_button_unchecked'}
                        filled={restaurantReady}
                        className={`mt-0.5 shrink-0 ${restaurantReady ? 'text-primary' : 'text-primary-fixed-dim'}`}
                      />
                      <div className="flex-1">
                        <p className="text-title-md text-on-surface">{restaurantSetupLabel}</p>
                        {!restaurantReady && (
                          <p className="mt-1 text-body-md text-on-surface-variant">{restaurantSetupHint}</p>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 lg:col-span-4">
            <div className="rounded-xl border border-outline-variant bg-surface-container-highest p-6">
              <h4 className="mb-4 text-title-md font-semibold text-on-surface">What&apos;s next?</h4>
              <ul className="space-y-4">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-label-lg font-semibold text-primary">
                    1
                  </span>
                  <p className="text-body-md text-on-surface-variant">
                    {usesCatalog
                      ? 'Set up your inventory in the partner app.'
                      : 'Set up your menu and restaurant details in the partner app.'}
                  </p>
                </li>
                <li className="flex gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label-lg font-semibold ${
                      restaurantReady
                        ? 'bg-white text-primary'
                        : 'bg-white text-on-surface-variant'
                    }`}
                  >
                    2
                  </span>
                  <p className="text-body-md text-on-surface-variant">
                    Go live when you are ready to accept orders from customers.
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          {!restaurantReady ? (
            <button
              type="button"
              onClick={onOpenSetup}
              disabled={loading || !onOpenSetup}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-secondary-container px-10 font-label-lg text-on-secondary-container disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <MaterialIcon name={setupInProgress ? 'arrow_back' : 'storefront'} />
              {setupInProgress ? 'Back to menu' : setupButtonLabel}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoLive}
                disabled={isPending || loading || !canGoLive}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-secondary-container px-10 font-label-lg text-on-secondary-container disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                <MaterialIcon name="bolt" />
                Go Live
              </button>
              <button
                type="button"
                onClick={onContinueToDashboard}
                className="flex h-12 w-full items-center justify-center rounded-full border border-outline px-10 font-label-lg text-primary hover:bg-primary/5 sm:w-auto"
              >
                Continue to dashboard
              </button>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-outline-variant bg-surface-dim py-8 text-center">
        <p className="text-body-md text-on-surface-variant">Need help with your setup?</p>
        <a
          href="mailto:support@roamdash.com"
          className="mt-2 inline-block text-label-lg text-primary underline"
        >
          support@roamdash.com
        </a>
      </footer>
    </div>
  );
}
