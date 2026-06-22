import { useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SlideToConfirm } from '@/components/ui/SlideToConfirm';
import { FRESH_MART_LOGO, type ActiveDelivery } from '@/lib/mockActiveDelivery';

type ShopAndPickPageProps = {
  delivery: ActiveDelivery;
  onClose: () => void;
  onConfirmPickup: () => void;
  onRequestUnassign: () => void;
  onReportIssue: () => void;
};

const TOTAL_ITEMS = 7;

export function ShopAndPickPage({
  delivery,
  onClose,
  onConfirmPickup,
  onReportIssue,
}: ShopAndPickPageProps) {
  const storeName = delivery.storeName ?? delivery.restaurant;
  const [picked, setPicked] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    delivery.checklist.forEach((item) => {
      if (item.status === 'found' || item.status === 'substitute') {
        initial[item.id] = true;
      }
    });
    return initial;
  });

  const pickedCount = useMemo(() => {
    const base = Object.values(picked).filter(Boolean).length;
    return Math.max(base, 3);
  }, [picked]);

  const progressPct = (pickedCount / TOTAL_ITEMS) * 100;
  const canCheckout = pickedCount >= TOTAL_ITEMS - 1;

  const togglePicked = (id: string) => {
    setPicked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background">
      <header className="sticky top-0 z-50 flex h-16 w-full shrink-0 items-center justify-between border-b border-outline-variant bg-surface/80 px-4 pt-safe backdrop-blur-md">
        <button type="button" onClick={onClose} aria-label="Menu" className="rounded-full p-2 text-primary">
          <MaterialIcon name="menu" />
        </button>
        <div className="rounded-full bg-primary-container px-3 py-1 text-label-lg font-semibold uppercase tracking-wider text-on-primary-container">
          Shopping
        </div>
        <button type="button" className="rounded-full p-2 text-primary">
          <MaterialIcon name="account_balance_wallet" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 overflow-y-auto px-4 pb-52 pt-4">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex items-start gap-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm md:col-span-2">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
              <img alt={storeName} src={FRESH_MART_LOGO} className="h-full w-full object-cover" />
            </div>
            <div>
              <h1 className="text-headline-md font-bold text-on-surface">{storeName}</h1>
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="rounded-full bg-secondary-container px-2 py-0.5 text-label-md font-semibold text-on-secondary-container">
                  Grocery
                </span>
                <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-label-md font-semibold text-on-surface-variant">
                  Pick & pack
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-xl bg-primary-container p-4 text-on-primary-container shadow-sm">
            <p className="text-label-lg opacity-90">Progress</p>
            <div className="mt-2">
              <p className="text-headline-md font-bold leading-none">
                {pickedCount} of {TOTAL_ITEMS}
              </p>
              <p className="mt-1 text-label-md">items picked</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-on-primary-container/20">
              <div className="h-full bg-white transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-headline-md font-bold text-on-surface">Picking List</h2>
            <span className="text-label-md text-on-surface-variant">Aisle sorting active</span>
          </div>

          <div className="space-y-2">
            {delivery.checklist.map((item) => {
              const isFound = item.status === 'found' || picked[item.id];
              const isSubstitute = item.status === 'substitute';

              if (isSubstitute) {
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-4 rounded-xl border-2 border-tertiary-container bg-surface p-4 shadow-md"
                  >
                    <div className="flex items-center gap-4">
                      {item.image && (
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-container">
                          <img alt={item.label} src={item.image} className="h-full w-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-body-lg font-semibold text-on-surface">{item.label}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="flex-1 rounded-lg border border-outline-variant bg-surface-container-high py-2 text-label-lg font-semibold text-on-surface-variant"
                          >
                            Can&apos;t find
                          </button>
                          <button
                            type="button"
                            className="flex-1 rounded-lg bg-tertiary py-2 text-label-lg font-semibold text-on-tertiary shadow-sm active:scale-95"
                          >
                            Substitute
                          </button>
                        </div>
                      </div>
                    </div>
                    {item.substituteLabel && (
                      <div className="flex items-center gap-2 rounded-lg border border-tertiary-container/30 bg-tertiary-container/10 p-2">
                        <MaterialIcon name="swap_horiz" className="text-tertiary" />
                        <p className="text-label-md text-on-tertiary-fixed-variant">
                          Substituted: <span className="font-bold">{item.substituteLabel}</span>
                        </p>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-4 rounded-xl border border-outline-variant bg-surface p-4 ${
                    isFound ? '' : 'cursor-pointer hover:border-primary'
                  }`}
                  onClick={() => !isFound && togglePicked(item.id)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !isFound) togglePicked(item.id);
                  }}
                  role={isFound ? undefined : 'button'}
                  tabIndex={isFound ? undefined : 0}
                >
                  {item.image && (
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-container">
                      <img
                        alt={item.label}
                        src={item.image}
                        className={`h-full w-full object-cover ${isFound ? 'opacity-50 grayscale' : ''}`}
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <p
                      className={`text-body-lg ${isFound ? 'text-on-surface-variant line-through' : 'font-semibold text-on-surface'}`}
                    >
                      {item.label}
                    </p>
                    {isFound ? (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-label-md text-primary">
                        <MaterialIcon name="check_circle" className="text-base" filled />
                        Found
                      </span>
                    ) : (
                      item.note && <p className="text-label-md text-on-surface-variant">{item.note}</p>
                    )}
                  </div>
                  {isFound ? (
                    <button type="button" className="text-outline transition-colors hover:text-primary">
                      <MaterialIcon name="edit" />
                    </button>
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded border-2 border-outline" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onReportIssue}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-label-lg font-semibold text-error transition-colors hover:bg-error/5"
          >
            <MaterialIcon name="report" className="text-lg" />
            Report issue
          </button>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 z-50 w-full">
        <div className="mx-4 mb-4 flex gap-3 rounded-2xl border border-outline-variant bg-white/85 p-3 shadow-lg backdrop-blur-md">
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container-high py-3 text-label-lg font-semibold text-on-surface"
          >
            <MaterialIcon name="chat_bubble" className="text-xl" />
            Message customer
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container-high py-3 text-label-lg font-semibold text-on-surface"
          >
            <MaterialIcon name="call" className="text-xl" />
            Call store
          </button>
        </div>
        <div className="border-t border-outline-variant bg-surface px-4 pb-8 pt-4 shadow-[0_-8px_24px_rgba(0,0,0,0.05)]">
          {canCheckout ? (
            <SlideToConfirm
              label="Done shopping — proceed to checkout"
              onComplete={onConfirmPickup}
              variant="pill"
            />
          ) : (
            <p className="py-4 text-center text-sm text-on-surface-variant">
              Pick remaining items to proceed to checkout
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
