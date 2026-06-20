import React, { useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SlideToConfirm } from '@/components/ui/SlideToConfirm';
import { WaitTimeSheet } from '@/components/delivery/WaitTimeSheet';
import type { ActiveDelivery } from '@/lib/mockActiveDelivery';

type AtRestaurantPageProps = {
  delivery: ActiveDelivery;
  onClose: () => void;
  onConfirmPickup: () => void;
  onRequestUnassign: () => void;
  onReportIssue: () => void;
};

export function AtRestaurantPage({
  delivery,
  onClose,
  onConfirmPickup,
  onRequestUnassign,
  onReportIssue,
}: AtRestaurantPageProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirmAll, setConfirmAll] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [waitSheetOpen, setWaitSheetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allItemIds = delivery.checklist.map((item) => item.id);
  const allChecked = allItemIds.every((id) => checked[id]);
  const canConfirm = allChecked && confirmAll && hasPhoto;

  const toggleItem = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleConfirmAll = () => {
    const next = !confirmAll;
    setConfirmAll(next);
    if (next) {
      const all: Record<string, boolean> = {};
      allItemIds.forEach((id) => {
        all[id] = true;
      });
      setChecked(all);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
      <header className="bg-surface shadow-sm flex justify-between items-center px-[var(--spacing-edge)] h-14 w-full z-50 shrink-0 pt-safe">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-primary hover:bg-surface-container-high transition-colors active:scale-95 p-2 -ml-2 rounded-full"
        >
          <MaterialIcon name="close" />
        </button>
        <div className="flex-1 flex justify-center">
          <span className="bg-primary-container text-on-primary-container text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full">
            At Restaurant
          </span>
        </div>
        <div className="w-10" aria-hidden />
      </header>

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 flex flex-col gap-6 pb-28">
        <section className="bg-surface rounded-xl shadow-soft p-4 flex flex-col gap-4 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-on-surface">{delivery.restaurant}</h2>
              <p className="text-sm text-muted mt-1 flex items-center gap-1">
                <MaterialIcon name="location_on" className="text-base" />
                {delivery.pickupAddressFull}
              </p>
            </div>
            <div className="bg-surface-container-low p-2 rounded-full text-primary">
              <MaterialIcon name="storefront" />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 border border-outline text-on-surface text-xs font-semibold uppercase tracking-wide py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-surface-container-low active:scale-95 min-h-12"
            >
              <MaterialIcon name="call" />
              Call Restaurant
            </button>
            <button
              type="button"
              onClick={onReportIssue}
              className="flex-1 border border-outline text-on-surface text-xs font-semibold uppercase tracking-wide py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-surface-container-low active:scale-95 min-h-12"
            >
              <MaterialIcon name="help" />
              Get Help
            </button>
          </div>
        </section>

        <section className="bg-surface rounded-xl shadow-soft flex flex-col overflow-hidden">
          <div className="p-4 bg-surface-container-lowest border-b border-surface-variant flex justify-between items-center gap-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Order #{delivery.orderId}
              </h3>
              <p className="text-base text-on-surface font-medium mt-1">
                Customer: {delivery.customerName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWaitSheetOpen(true)}
              className="text-primary text-[11px] font-medium uppercase tracking-wider underline shrink-0"
            >
              Order not ready?
            </button>
          </div>

          <div className="flex flex-col">
            {delivery.checklist.map((item) => (
              <label
                key={item.id}
                className="flex items-center p-4 border-b border-surface-variant cursor-pointer hover:bg-surface-container-lowest transition-colors min-h-14"
              >
                <input
                  type="checkbox"
                  checked={!!checked[item.id]}
                  onChange={() => toggleItem(item.id)}
                  className="h-6 w-6 text-primary rounded border-outline-variant focus:ring-primary mr-4 shrink-0"
                />
                <div className="flex-1">
                  <span className="text-base text-on-surface block">{item.label}</span>
                  {item.note && (
                    <span className="text-sm text-muted block">{item.note}</span>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="p-4 bg-surface-container-low">
            <label className="flex items-center cursor-pointer min-h-12">
              <input
                type="checkbox"
                checked={confirmAll}
                onChange={toggleConfirmAll}
                className="h-5 w-5 text-success rounded border-outline-variant focus:ring-success mr-2"
              />
              <span className="text-sm text-on-surface font-medium">Confirm all items</span>
            </label>
          </div>
        </section>

        <section className="bg-surface rounded-xl shadow-soft p-4 flex flex-col gap-2">
          <h3 className="text-base text-on-surface font-medium">Photo of sealed order</h3>
          <p className="text-sm text-muted mb-2">Required for contactless pickup</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={() => setHasPhoto(true)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-lg h-32 flex flex-col items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              hasPhoto
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-outline-variant text-muted hover:bg-surface-container-lowest hover:border-primary hover:text-primary'
            }`}
          >
            <MaterialIcon name={hasPhoto ? 'check_circle' : 'photo_camera'} className="text-[32px]" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {hasPhoto ? 'Photo captured' : 'Take Photo'}
            </span>
          </button>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface border-t border-surface-variant p-[var(--spacing-edge)] shadow-[0_-12px_24px_rgba(0,0,0,0.08)] z-40 pb-safe">
        {canConfirm ? (
          <SlideToConfirm label="SLIDE TO CONFIRM PICKUP" onComplete={onConfirmPickup} variant="en-route" />
        ) : (
          <p className="text-center text-sm text-muted py-4">
            Complete the checklist and photo to confirm pickup
          </p>
        )}
      </div>

      <WaitTimeSheet
        open={waitSheetOpen}
        onClose={() => setWaitSheetOpen(false)}
        onWait={() => setWaitSheetOpen(false)}
        onUnassign={() => {
          setWaitSheetOpen(false);
          onRequestUnassign();
        }}
      />
    </div>
  );
}
