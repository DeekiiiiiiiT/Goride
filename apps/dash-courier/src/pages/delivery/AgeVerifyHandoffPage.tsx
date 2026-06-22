import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SlideToConfirm } from '@/components/ui/SlideToConfirm';

const ID_CAPTURE_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCHp39bI4iGduBQmwM3ohch5G_folfKgqIGFHLLivVggHNM9NCgHXqs5yswIEtQiW_NCwZa9WL1NcUskeJ7VuG8Mr3z8uS_DYcIT805O02VU6ikG3MkQNKT6aU6W0ptvPHrNy7U9aewhD8xX2YqI8WdDYG49kEN_xWulejrYZAMAWloIOobH4rXhmSHogXpMs2TH_04lpGdtHOqzxGkpX4JGfs9uOzS4BVnLW42l0-M1fj2rgTSs6j2V7TvQubdSqCAVMjmJWBU3Us';

type AgeVerifyHandoffPageProps = {
  customerName: string;
  dropoffAddress?: string;
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
  dropoffAddress = '242 West End Ave, Apt 4C',
  onComplete,
  onBack,
}: AgeVerifyHandoffPageProps) {
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  const [photoCaptured, setPhotoCaptured] = useState(false);

  const allChecked = CHECKLIST.every((_, i) => checks[i]);
  const canComplete = allChecked && photoCaptured;

  const toggleCheck = (index: number) => {
    setChecks((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      <nav className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button type="button" onClick={onBack} className="rounded-full p-2 text-primary hover:bg-surface-container">
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-md font-bold text-primary">VERIFY ID</h1>
        </div>
        <button type="button" className="rounded-full p-2 text-primary hover:bg-surface-container">
          <MaterialIcon name="help" />
        </button>
      </nav>

      <main className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 pb-32 pt-20">
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
              Do not leave alcohol unattended or with minors. You must verify identity before handing off the order.
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
          <button
            type="button"
            onClick={() => setPhotoCaptured(true)}
            className="relative flex aspect-[16/9] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container transition-colors hover:border-primary"
          >
            <img alt="" src={ID_CAPTURE_IMAGE} className="absolute inset-0 h-full w-full object-cover opacity-60" />
            <div className="relative z-10 flex flex-col items-center rounded-xl border border-white bg-white/90 px-6 py-4 shadow-lg backdrop-blur">
              <MaterialIcon name="photo_camera" className="mb-2 text-4xl text-primary" filled />
              <p className="text-label-lg font-semibold text-primary">
                {photoCaptured ? 'ID photo captured' : 'Capture ID verification'}
              </p>
              <p className="mt-1 text-center text-[10px] text-on-surface-variant">
                Blur personal details except photo/birthdate
              </p>
            </div>
          </button>
        </section>

        <div className="text-center">
          <button type="button" className="px-4 py-2 text-label-lg font-semibold text-error hover:underline">
            Cannot verify — return to store
          </button>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-outline-variant bg-white px-4 py-4 pb-safe">
        {canComplete ? (
          <SlideToConfirm label="Confirm delivery" onComplete={onComplete} variant="pill" />
        ) : (
          <SlideToConfirm label="Confirm delivery" onComplete={() => {}} variant="pill" disabled />
        )}
      </div>
    </div>
  );
}
