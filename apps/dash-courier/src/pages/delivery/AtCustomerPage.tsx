import React, { useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { ActiveDelivery, DropoffMethod } from '@/lib/mockActiveDelivery';
import { CUSTOMER_AVATAR } from '@/lib/mockActiveDelivery';

type AtCustomerPageProps = {
  delivery: ActiveDelivery;
  onBack: () => void;
  onComplete: (method: DropoffMethod, hasPhoto: boolean) => void;
  onCustomerUnavailable: () => void;
};

export function AtCustomerPage({
  delivery,
  onBack,
  onComplete,
  onCustomerUnavailable,
}: AtCustomerPageProps) {
  const [method, setMethod] = useState<DropoffMethod>('leave-at-door');
  const [hasPhoto, setHasPhoto] = useState(false);
  const [note, setNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canComplete = method === 'hand-to-customer' || hasPhoto;

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
      <header className="flex justify-between items-center px-[var(--spacing-edge)] h-14 w-full bg-surface shadow-sm z-40 shrink-0 pt-safe">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="w-12 h-12 flex items-center justify-center -ml-3 rounded-full hover:bg-surface-container-high active:scale-95"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-on-surface tracking-tight">
            Order #{delivery.displayOrderId}
          </span>
        </div>
        <button
          type="button"
          className="h-10 px-3 rounded-full bg-surface-container flex items-center justify-center -mr-2 active:scale-95"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">Help</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 flex flex-col gap-6 pb-36">
        <div className="flex justify-center w-full">
          <div className="bg-[#dcfce7] text-success px-5 py-2.5 rounded-full flex items-center gap-2 shadow-[0_4px_12px_rgba(34,197,94,0.15)] border border-success/20">
            <MaterialIcon name="location_on" className="text-xl" filled />
            <span className="text-xs font-bold uppercase tracking-widest">At Customer</span>
          </div>
        </div>

        <section className="bg-surface rounded-2xl p-4 shadow-soft flex justify-between items-center border border-surface-variant">
          <div className="flex items-center gap-4">
            <div className="w-[52px] h-[52px] rounded-full bg-surface-container overflow-hidden border border-outline-variant/30">
              <img src={CUSTOMER_AVATAR} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-on-surface mb-0.5">{delivery.customerFirstName}</h2>
              <span className="text-[11px] text-muted uppercase tracking-wider">Customer</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center border border-surface-dim active:scale-90"
            >
              <MaterialIcon name="chat" />
            </button>
            <button
              type="button"
              className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 active:scale-90"
            >
              <MaterialIcon name="call" filled />
            </button>
          </div>
        </section>

        <section className="bg-surface rounded-[24px] p-4 shadow-soft border-l-[6px] border-primary relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted mb-4 flex items-center gap-2">
            <MaterialIcon name="receipt_long" className="text-lg" />
            Delivery Instructions
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-4 bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/40 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <MaterialIcon name="sensor_door" className="text-xl" />
              </div>
              <span className="text-base font-semibold text-on-surface pt-2">
                Leave at door, don&apos;t knock
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3 bg-surface-container-low p-3 rounded-xl border border-outline-variant/20">
                <MaterialIcon name="dialpad" className="text-muted text-xl shrink-0" />
                <div>
                  <span className="text-[10px] text-muted uppercase block">Gate Code</span>
                  <span className="text-sm font-semibold text-on-surface">{delivery.gateCode}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-surface-container-low p-3 rounded-xl border border-outline-variant/20">
                <MaterialIcon name="apartment" className="text-muted text-xl shrink-0" />
                <div>
                  <span className="text-[10px] text-muted uppercase block">Unit</span>
                  <span className="text-sm font-semibold text-on-surface">{delivery.unit}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted px-1">Drop-off Method</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMethod('leave-at-door')}
              className={`flex flex-col items-center justify-center p-6 rounded-[20px] border-2 gap-3 h-[120px] relative overflow-hidden active:scale-[0.98] transition-all ${
                method === 'leave-at-door'
                  ? 'border-primary bg-primary/5'
                  : 'border-surface-variant bg-surface hover:border-outline-variant'
              }`}
            >
              {method === 'leave-at-door' && (
                <div className="absolute inset-0 bg-gradient-to-b from-white/50 to-transparent pointer-events-none" />
              )}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md ${
                  method === 'leave-at-door' ? 'bg-primary' : 'bg-surface-container'
                }`}
              >
                <MaterialIcon
                  name="package"
                  className={method === 'leave-at-door' ? 'text-on-primary' : 'text-muted'}
                  filled={method === 'leave-at-door'}
                />
              </div>
              <span
                className={`text-xs font-semibold uppercase tracking-wide text-center ${
                  method === 'leave-at-door' ? 'text-primary' : 'text-muted'
                }`}
              >
                Leave at door
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMethod('hand-to-customer')}
              className={`flex flex-col items-center justify-center p-6 rounded-[20px] border-2 gap-3 h-[120px] active:scale-[0.98] transition-all ${
                method === 'hand-to-customer'
                  ? 'border-primary bg-primary/5'
                  : 'border-surface-variant bg-surface hover:border-outline-variant'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  method === 'hand-to-customer' ? 'bg-primary' : 'bg-surface-container'
                }`}
              >
                <MaterialIcon
                  name="front_hand"
                  className={method === 'hand-to-customer' ? 'text-on-primary' : 'text-muted'}
                />
              </div>
              <span
                className={`text-xs font-semibold uppercase tracking-wide text-center ${
                  method === 'hand-to-customer' ? 'text-primary' : 'text-muted'
                }`}
              >
                Hand it to customer
              </span>
            </button>
          </div>
        </section>

        {method === 'leave-at-door' && (
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted px-1">
              Proof of Delivery
            </h3>
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
              className={`w-full h-40 rounded-[24px] border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all active:scale-[0.99] ${
                hasPhoto
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-primary/40 bg-surface text-primary hover:bg-primary/5 hover:border-primary'
              }`}
            >
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <MaterialIcon name={hasPhoto ? 'check_circle' : 'photo_camera'} className="text-[28px]" />
              </div>
              <span className="text-sm font-medium">
                {hasPhoto ? 'Photo captured' : 'Take photo of order at door'}
              </span>
            </button>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted px-1">
            Additional Details
          </h3>
          <div className="relative">
            <MaterialIcon
              name="edit_note"
              className="absolute left-4 top-4 text-muted pointer-events-none text-xl"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-[20px] border border-outline-variant bg-surface py-3.5 pl-11 pr-4 text-base text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none shadow-sm placeholder:text-muted/60"
              placeholder="Add an optional note..."
              rows={2}
            />
          </div>
        </section>

        {method === 'hand-to-customer' && (
          <button
            type="button"
            onClick={onCustomerUnavailable}
            className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center justify-center gap-1"
          >
            <MaterialIcon name="help" className="text-base" />
            Customer not available?
          </button>
        )}
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface/90 backdrop-blur-md shadow-[0_-8px_32px_rgba(0,0,0,0.08)] p-[var(--spacing-edge)] pb-safe z-50 rounded-t-[32px] border-t border-surface-variant">
        <button
          type="button"
          onClick={() => onComplete(method, hasPhoto)}
          disabled={!canComplete}
          className="w-full h-[60px] rounded-[20px] bg-primary text-on-primary text-lg font-semibold tracking-wide flex items-center justify-center gap-3 shadow-[0_8px_20px_rgba(0,108,73,0.3)] active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>Complete Delivery</span>
          <MaterialIcon name="check_circle" className="text-2xl" />
        </button>
      </div>
    </div>
  );
}
