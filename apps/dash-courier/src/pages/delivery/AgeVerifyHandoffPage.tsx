import { useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SlideToConfirm } from '@/components/ui/SlideToConfirm';
import { submitCourierProof } from '@/lib/courierApi';
import { uploadAndGetProofUrl } from '@/lib/courierFileUpload';
import { toast } from '@/lib/toast';

type AgeVerifyHandoffPageProps = {
  customerName: string;
  dropoffAddress?: string;
  orderId: string;
  onComplete: () => void;
  onBack: () => void;
};

const CHECKLIST = [
  'Customer appears 18+',
  'Valid government ID checked (driver licence / passport)',
  'ID matches recipient or authorized adult',
];

export function AgeVerifyHandoffPage({
  customerName,
  dropoffAddress = 'Delivery address',
  orderId,
  onComplete,
  onBack,
}: AgeVerifyHandoffPageProps) {
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allChecked = CHECKLIST.every((_, i) => checks[i]);
  const canComplete = allChecked && !!photoUrl && !uploading;

  const toggleCheck = (index: number) => {
    setChecks((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const url = await uploadAndGetProofUrl(file, 'proofs');
    setUploading(false);
    if (!url) {
      toast.error('Upload failed', 'Could not store ID verification photo.');
      setPreview(null);
      return;
    }
    setPhotoUrl(url);
    toast.success('ID photo saved');
  };

  const handleConfirm = async () => {
    if (!photoUrl || !orderId) return;
    setSubmitting(true);
    const ok = await submitCourierProof(orderId, 'age_verify', photoUrl);
    setSubmitting(false);
    if (!ok) {
      toast.error('Verification failed', 'Could not record ID verification. Try again.');
      return;
    }
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      <nav className="fixed top-0 z-50 flex min-h-16 pt-safe w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button type="button" onClick={onBack} className="rounded-full p-2 text-primary hover:bg-surface-container">
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-md font-bold text-primary">VERIFY ID</h1>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 pb-32 pt-[calc(4rem+env(safe-area-inset-top,0px)+1rem)]">
        <section className="mb-6">
          <div className="mb-4 rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="mb-1 text-label-md uppercase tracking-wider text-on-surface-variant">Customer</p>
                <h2 className="text-headline-md font-bold text-on-surface">{customerName}</h2>
                <div className="mt-1 flex items-center text-on-surface-variant">
                  <MaterialIcon name="location_on" className="mr-1 text-lg" />
                  <span className="text-body-md">{dropoffAddress}</span>
                </div>
              </div>
              <div className="flex animate-pulse items-center gap-1 rounded-full bg-tertiary-container px-3 py-1 text-label-md font-semibold text-on-tertiary-container">
                <MaterialIcon name="no_drinks" className="text-base" filled />
                ALCOHOL
              </div>
            </div>
          </div>

          <div className="flex gap-4 rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container">
            <MaterialIcon name="warning" className="shrink-0 text-error" />
            <p className="text-body-md font-semibold leading-snug">
              Do not leave alcohol unattended or with minors. Capture a photo of the verified ID before handoff.
            </p>
          </div>
        </section>

        <section className="mb-8 space-y-3">
          <h3 className="px-1 text-label-lg font-semibold text-on-surface">Compliance Checklist</h3>
          {CHECKLIST.map((label, index) => (
            <label
              key={label}
              className="group flex cursor-pointer items-center rounded-xl border border-outline-variant bg-white p-4 transition-all hover:bg-surface-container-low active:scale-[0.98]"
            >
              <input
                type="checkbox"
                checked={!!checks[index]}
                onChange={() => toggleCheck(index)}
                className="h-6 w-6 rounded-md border-2 border-outline text-primary focus:ring-0"
              />
              <span className="ml-4 text-body-lg text-on-surface">{label}</span>
            </label>
          ))}
        </section>

        <section className="mb-8">
          <h3 className="mb-2 px-1 text-label-lg font-semibold text-on-surface">Verification Evidence</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleCapture(e)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="relative flex aspect-[16/9] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container transition-colors hover:border-primary"
          >
            {preview ? (
              <img alt="ID capture preview" src={preview} className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
            <div className="relative z-10 flex flex-col items-center rounded-xl border border-white bg-white/90 px-6 py-4 shadow-lg backdrop-blur">
              <MaterialIcon name="photo_camera" className="mb-2 text-4xl text-primary" filled />
              <p className="text-label-lg font-semibold text-primary">
                {uploading ? 'Uploading…' : photoUrl ? 'ID photo captured' : 'Capture ID verification'}
              </p>
              <p className="mt-1 text-center text-[10px] text-on-surface-variant">
                Blur personal details except photo/birthdate
              </p>
            </div>
          </button>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-outline-variant bg-white px-4 py-4 pb-safe">
        {canComplete && !submitting ? (
          <SlideToConfirm label="Confirm delivery" onComplete={() => void handleConfirm()} variant="pill" />
        ) : (
          <SlideToConfirm
            label={submitting ? 'Saving…' : 'Confirm delivery'}
            onComplete={() => {}}
            variant="pill"
            disabled
          />
        )}
      </div>
    </div>
  );
}
