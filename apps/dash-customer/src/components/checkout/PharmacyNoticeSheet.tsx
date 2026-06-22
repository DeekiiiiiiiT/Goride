import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

const PHARMACY_NOTICE_KEY = 'roam_pharmacy_notice_ack';

export function isPharmacyNoticeAcknowledged(): boolean {
  return sessionStorage.getItem(PHARMACY_NOTICE_KEY) === '1';
}

export function acknowledgePharmacyNotice(): void {
  sessionStorage.setItem(PHARMACY_NOTICE_KEY, '1');
}

type Props = {
  storeName?: string;
  itemCount?: number;
  onContinue: () => void;
  onDismiss?: () => void;
};

export default function PharmacyNoticeSheet({
  storeName = 'Pharmacy',
  itemCount = 0,
  onContinue,
  onDismiss,
}: Props) {
  const [agreed, setAgreed] = useState(false);

  const handleContinue = () => {
    if (!agreed) return;
    acknowledgePharmacyNotice();
    onContinue();
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-on-background/30"
        onClick={onDismiss}
      />
      <div className="relative z-10 w-full max-w-lg mx-auto rounded-t-xl bg-surface-container-lowest shadow-2xl">
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-8 rounded-full bg-outline-variant" />
        </div>
        <div className="px-6 pb-8 pt-2">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container">
              <MaterialIcon name="health_and_safety" className="text-on-secondary-container" />
            </div>
            <h2 className="text-headline-lg-mobile font-bold text-on-surface">Pharmacy order notice</h2>
            <p className="mt-2 max-w-sm text-body-md text-on-surface-variant">
              Please review these important guidelines before proceeding with your pharmacy order.
            </p>
            {itemCount > 0 && (
              <p className="mt-2 text-label-md text-on-surface-variant">
                {storeName} · {itemCount} item{itemCount === 1 ? '' : 's'}
              </p>
            )}
          </div>

          <ul className="mb-8 space-y-3">
            {[
              {
                icon: 'verified',
                text: 'Prescription items may require verification from your healthcare provider.',
              },
              {
                icon: 'medical_services',
                text: 'Courier cannot provide medical advice or instructions regarding your medication.',
              },
              {
                icon: 'info',
                text: 'Some items are pickup-only or restricted due to local regulations.',
              },
            ].map((item) => (
              <li
                key={item.icon}
                className="flex items-start gap-3 rounded-xl bg-surface-container-low p-4"
              >
                <MaterialIcon name={item.icon} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-body-md text-on-surface">{item.text}</p>
              </li>
            ))}
          </ul>

          <label className="mb-6 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-6 w-6 rounded border-outline text-primary focus:ring-primary"
            />
            <span className="text-label-lg text-on-surface-variant">I understand and agree</span>
          </label>

          <button
            type="button"
            disabled={!agreed}
            onClick={handleContinue}
            className="flex h-14 w-full items-center justify-center rounded-full bg-primary-container text-label-lg font-semibold text-on-primary-container transition-all disabled:cursor-not-allowed disabled:bg-outline-variant disabled:text-on-surface-variant disabled:opacity-60"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
