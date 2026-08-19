import React, { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { openPhoneCall, toDialablePhone } from '@/lib/contactLinks';
import { uploadAndGetProofUrl } from '@/lib/courierFileUpload';
import { toast } from '@/lib/toast';

type CustomerUnavailablePageProps = {
  customerPhone?: string | null;
  onClose: () => void;
  onLeaveAtSafeLocation: (photoPath: string) => void;
};

const INITIAL_SECONDS = 300;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CustomerUnavailablePage({
  customerPhone,
  onClose,
  onLeaveAtSafeLocation,
}: CustomerUnavailablePageProps) {
  const [secondsLeft, setSecondsLeft] = useState(INITIAL_SECONDS);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPhotoStep, setShowPhotoStep] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerExpired = secondsLeft <= 0;
  const dialable = toDialablePhone(customerPhone);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = await uploadAndGetProofUrl(file, 'proofs');
    setUploading(false);
    if (!path) {
      toast.error('Photo upload failed', 'Tap to try again.');
      return;
    }
    setPhotoPath(path);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col">
      <header className="bg-surface shadow-sm flex justify-between items-center px-[var(--spacing-edge)] min-h-14 w-full z-50 fixed top-0 pt-safe">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-on-surface hover:bg-surface-container-high p-2 rounded-full active:scale-95"
        >
          <MaterialIcon name="close" />
        </button>
        <h1 className="text-xl font-bold text-primary">Roam Rush Courier</h1>
        <div className="flex items-center text-primary text-xs font-semibold uppercase tracking-wide">
          <MaterialIcon name="bolt" className="text-base mr-1" />
          Online
        </div>
      </header>

      <main className="flex-1 flex flex-col px-[var(--spacing-edge)] pt-[calc(3.5rem+env(safe-area-inset-top,0px)+1.5rem)] gap-6 overflow-y-auto pb-safe">
        <section className="flex flex-col items-center justify-center py-6 bg-surface rounded-xl shadow-soft border-l-4 border-warning">
          <MaterialIcon name="hourglass_empty" className="text-warning mb-2 text-5xl" />
          <h2 className="text-xl font-semibold text-on-surface mb-1">Waiting for customer...</h2>
          <p
            className={`text-[28px] leading-9 font-bold tabular-nums ${
              timerExpired ? 'text-error' : 'text-on-surface'
            }`}
          >
            {formatTime(Math.max(0, secondsLeft))}
          </p>
          <p className="text-sm text-muted mt-2 text-center px-4">
            Please attempt to contact the customer before leaving the order.
          </p>
        </section>

        {dialable && (
          <section className="grid grid-cols-1 gap-4">
            <button
              type="button"
              onClick={() => openPhoneCall(dialable)}
              className="flex flex-col items-center justify-center bg-primary text-on-primary rounded-xl py-4 px-2 shadow-primary active:scale-95 min-h-20"
            >
              <MaterialIcon name="call" className="mb-2" />
              <span className="text-xs font-semibold uppercase tracking-wide">Call Customer</span>
            </button>
          </section>
        )}

        <hr className="border-t border-surface-container-high -mx-[var(--spacing-edge)]" />

        <section className="flex flex-col gap-2 pb-safe">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
            Resolution Options
          </h3>

          {!showPhotoStep ? (
            <button
              type="button"
              onClick={() => timerExpired && setShowPhotoStep(true)}
              disabled={!timerExpired}
              className={`flex items-center justify-between w-full bg-surface p-4 rounded-xl shadow-soft text-left border border-transparent ${
                timerExpired
                  ? 'hover:border-outline-variant active:scale-95'
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="bg-surface-container-low p-2 rounded-full text-primary">
                  <MaterialIcon name="place" filled />
                </div>
                <div>
                  <span className="block text-base font-semibold text-on-surface">
                    Leave at safe location
                  </span>
                  <span className="block text-sm text-muted">Requires a photo</span>
                </div>
              </div>
              <MaterialIcon name="chevron_right" className="text-muted" />
            </button>
          ) : (
            <div className="bg-surface p-4 rounded-xl shadow-soft space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCapture}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 rounded-xl border-2 border-dashed border-primary/40 flex flex-col items-center justify-center gap-2 text-primary"
              >
                <MaterialIcon name={photoPath ? 'check_circle' : 'photo_camera'} />
                <span>{uploading ? 'Uploading…' : photoPath ? 'Photo captured' : 'Take proof photo'}</span>
              </button>
              <button
                type="button"
                disabled={!photoPath || uploading}
                onClick={() => photoPath && onLeaveAtSafeLocation(photoPath)}
                className="w-full min-h-12 bg-primary text-on-primary rounded-xl font-semibold disabled:opacity-50"
              >
                Complete delivery
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
