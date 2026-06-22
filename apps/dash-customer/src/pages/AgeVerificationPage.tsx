import { useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

const AGE_VERIFIED_KEY = 'roam_age_verified';

export function isAgeVerified(): boolean {
  return localStorage.getItem(AGE_VERIFIED_KEY) === '1';
}

export function markAgeVerified(): void {
  localStorage.setItem(AGE_VERIFIED_KEY, '1');
}

type AgeVerificationPageProps = {
  onVerified: () => void;
  onCancel: () => void;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function AgeVerificationPage({ onVerified, onCancel }: AgeVerificationPageProps) {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 100 }, (_, i) => current - i);
  }, []);

  const handleSubmit = () => {
    if (!day || !month || !year) {
      setError('Select your full date of birth');
      return;
    }
    if (!confirmed) {
      setError('Confirm you are 18+ and will present ID at delivery');
      return;
    }

    const monthIndex = MONTHS.indexOf(month);
    const birth = new Date(Number(year), monthIndex, Number(day));
    const ageMs = Date.now() - birth.getTime();
    const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears < 18) {
      setError('You must be 18 or older to order alcohol');
      return;
    }

    setSubmitting(true);
    setTimeout(() => {
      markAgeVerified();
      onVerified();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-on-background/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-2xl">
        <div className="relative flex h-32 items-center justify-center bg-primary-container">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, #ffffff 1px, transparent 0)',
              backgroundSize: '16px 16px',
            }}
          />
          <div className="rounded-full bg-white p-4 shadow-lg">
            <MaterialIcon name="badge" className="text-5xl text-primary" />
          </div>
        </div>

        <div className="p-4 md:p-6">
          <h1 className="text-center text-headline-lg-mobile font-bold text-on-surface">Verify your age</h1>
          <p className="mb-6 mt-2 text-center text-body-md text-on-surface-variant">
            You must be 18 or older to order alcohol. You&apos;ll need to show valid ID to the courier at delivery.
          </p>

          <div className="mb-6">
            <label className="mb-2 block text-label-lg text-on-surface-variant">Date of Birth</label>
            <div className="grid grid-cols-3 gap-2">
              <div className="relative">
                <select
                  value={day}
                  onChange={(e) => {
                    setDay(e.target.value);
                    setError('');
                  }}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-outline bg-surface px-3 py-3 text-body-md focus:border-primary focus:ring-2 focus:ring-primary"
                >
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d)}>
                      {d}
                    </option>
                  ))}
                </select>
                <MaterialIcon
                  name="expand_more"
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant"
                />
              </div>
              <div className="relative">
                <select
                  value={month}
                  onChange={(e) => {
                    setMonth(e.target.value);
                    setError('');
                  }}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-outline bg-surface px-3 py-3 text-body-md focus:border-primary focus:ring-2 focus:ring-primary"
                >
                  <option value="">Month</option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <MaterialIcon
                  name="expand_more"
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant"
                />
              </div>
              <div className="relative">
                <select
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setError('');
                  }}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-outline bg-surface px-3 py-3 text-body-md focus:border-primary focus:ring-2 focus:ring-primary"
                >
                  <option value="">Year</option>
                  {years.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
                <MaterialIcon
                  name="expand_more"
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant"
                />
              </div>
            </div>
          </div>

          <label className="mb-6 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                setError('');
              }}
              className="mt-1 h-5 w-5 rounded border-outline text-primary focus:ring-primary"
            />
            <span className="text-body-md leading-tight text-on-surface-variant">
              I confirm I am 18+ and will present ID at delivery.
            </span>
          </label>

          {error && <p className="mb-4 text-sm text-error">{error}</p>}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="w-full rounded-xl bg-primary-container py-4 text-label-lg font-semibold text-on-primary-container shadow-sm transition-all active:scale-95 disabled:opacity-70"
            >
              {submitting ? 'Verifying…' : 'Continue to checkout'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full py-2 text-label-lg text-on-surface-variant transition-colors hover:text-on-surface"
            >
              Remove alcohol items
            </button>
          </div>
        </div>

        <div className="bg-surface-container px-4 py-3 text-center">
          <p className="flex items-center justify-center gap-1 text-label-md text-on-surface-variant">
            <MaterialIcon name="verified_user" className="text-sm" />
            Official Roam Dash verification gate
          </p>
        </div>
      </div>
    </div>
  );
}
