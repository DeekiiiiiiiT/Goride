import { useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SlideToConfirm } from '@/components/ui/SlideToConfirm';
import { FRESH_MART_LOGO, type ActiveDelivery } from '@/lib/mockActiveDelivery';
import { openPhoneCall, openSmsMessage, toDialablePhone } from '@/lib/contactLinks';
import { submitCourierIssue, proposeItemSubstitute } from '@/lib/courierApi';
import { toast } from '@/lib/toast';
import { realDispatchProvider } from '@/services/courierDispatch/RealDispatchProvider';

type ShopAndPickPageProps = {
  delivery: ActiveDelivery;
  onClose: () => void;
  onConfirmPickup: (pickupPhotoUrl?: string) => void;
  onRequestUnassign: () => void;
  onReportIssue: () => void;
};

export function ShopAndPickPage({
  delivery,
  onClose,
  onConfirmPickup,
  onReportIssue,
}: ShopAndPickPageProps) {
  const storeName = delivery.storeName ?? delivery.restaurant;
  const storePhone = toDialablePhone(delivery.storePhone);
  const customerPhone = toDialablePhone(delivery.customerPhone);
  const totalItems = Math.max(1, delivery.checklist.length || delivery.itemCount || 1);
  const [picked, setPicked] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    delivery.checklist.forEach((item) => {
      if (item.status === 'found') {
        initial[item.id] = true;
      }
    });
    return initial;
  });
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [substitutingId, setSubstitutingId] = useState<string | null>(null);

  const pickedCount = useMemo(
    () => Object.values(picked).filter(Boolean).length,
    [picked],
  );

  const progressPct = (pickedCount / totalItems) * 100;
  const canCheckout = pickedCount >= Math.max(1, totalItems - 1);

  const togglePicked = (id: string) => {
    setPicked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubstitute = async (item: { id: string; label: string }, index: number) => {
    const substituteLabel = window.prompt(`Substitute for ${item.label}?`, '');
    if (!substituteLabel?.trim()) return;
    const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
    setSubstitutingId(item.id);
    const ok = await proposeItemSubstitute(orderId, {
      itemIndex: index,
      itemLabel: item.label,
      substituteLabel: substituteLabel.trim(),
    });
    setSubstitutingId(null);
    if (ok) {
      toast.success('Substitute sent', 'Waiting for customer approval.');
    } else {
      toast.error('Could not propose substitute', 'Try again or use Report issue.');
    }
  };

  const handleCantFind = async (item: { id: string; label: string }) => {
    const orderId = realDispatchProvider.activeOrderId || delivery.orderId;
    setReportingId(item.id);
    const ok = await submitCourierIssue(orderId, 'wrong_items', `cant_find:${item.label}`);
    setReportingId(null);
    if (ok) {
      toast.success("Can't find logged", item.label);
    } else {
      toast.error('Could not log item', 'Try Report issue instead.');
    }
    if (customerPhone) {
      openSmsMessage(
        customerPhone,
        `Hi, this is your Roam Rush courier. I can't find ${item.label} in the store.`,
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-background">
      <header className="sticky top-0 z-50 flex h-16 w-full shrink-0 items-center justify-between border-b border-outline-variant bg-surface/80 px-4 pt-safe backdrop-blur-md safe-x">
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-primary">
          <MaterialIcon name="close" />
        </button>
        <div className="rounded-full bg-primary-container px-3 py-1 text-label-lg font-semibold uppercase tracking-wider text-on-primary-container">
          Shopping
        </div>
        <div className="w-10" aria-hidden />
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
                {pickedCount} of {totalItems}
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
            {delivery.checklist.map((item, index) => {
              const isFound = Boolean(picked[item.id]);

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
                      <>
                        {item.note && <p className="text-label-md text-on-surface-variant">{item.note}</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={reportingId === item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleCantFind(item);
                            }}
                            className="rounded-lg border border-outline-variant bg-surface-container-high px-3 py-1.5 text-label-lg font-semibold text-on-surface-variant disabled:opacity-60"
                          >
                            {reportingId === item.id ? 'Logging…' : "Can't find"}
                          </button>
                          <button
                            type="button"
                            disabled={substitutingId === item.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleSubstitute(item, index);
                            }}
                            className="rounded-lg border border-primary/30 bg-primary-container/20 px-3 py-1.5 text-label-lg font-semibold text-primary disabled:opacity-60"
                          >
                            {substitutingId === item.id ? 'Sending…' : 'Substitute'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {isFound ? (
                    <button
                      type="button"
                      aria-label="Mark as not found"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePicked(item.id);
                      }}
                      className="text-outline transition-colors hover:text-primary"
                    >
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
        {(customerPhone || storePhone) && (
          <div className="mx-4 mb-4 flex gap-3 rounded-2xl border border-outline-variant bg-white/85 p-3 shadow-lg backdrop-blur-md">
            {customerPhone && (
              <button
                type="button"
                onClick={() => openSmsMessage(customerPhone, 'Hi, this is your Roam Rush courier shopping your order.')}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container-high py-3 text-label-lg font-semibold text-on-surface"
              >
                <MaterialIcon name="chat_bubble" className="text-xl" />
                Message customer
              </button>
            )}
            {storePhone && (
              <button
                type="button"
                onClick={() => openPhoneCall(storePhone)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-container-high py-3 text-label-lg font-semibold text-on-surface"
              >
                <MaterialIcon name="call" className="text-xl" />
                Call store
              </button>
            )}
          </div>
        )}
        <div className="border-t border-outline-variant bg-surface px-4 pb-safe pt-4 shadow-[0_-8px_24px_rgba(0,0,0,0.05)]">
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
