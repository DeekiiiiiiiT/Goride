/**
 * Soft-launch age gate is disabled (no alcohol). Kept for a future restricted-SKU flag.
 * Do not present this as an official ID check until a real server-side verifier exists.
 */
const AGE_VERIFIED_KEY = 'roam_age_verified';

export function isAgeVerified(): boolean {
  return localStorage.getItem(AGE_VERIFIED_KEY) === '1';
}

export function markAgeVerified(): void {
  localStorage.setItem(AGE_VERIFIED_KEY, '1');
}

export function clearAgeVerified(): void {
  localStorage.removeItem(AGE_VERIFIED_KEY);
}

type AgeVerificationPageProps = {
  onVerified: () => void;
  onCancel: () => void;
};

/** Feature-flagged UI only — not mounted in soft-launch App routing. */
export default function AgeVerificationPage({ onVerified, onCancel }: AgeVerificationPageProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-on-background/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-2xl text-center">
        <h1 className="text-headline-lg-mobile font-bold text-on-surface mb-2">Age check unavailable</h1>
        <p className="text-body-md text-on-surface-variant mb-6">
          Age-restricted items are not available in this release.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-xl bg-primary-container py-4 text-label-lg font-semibold"
        >
          Back to cart
        </button>
        <button type="button" onClick={onVerified} className="hidden" aria-hidden />
      </div>
    </div>
  );
}
