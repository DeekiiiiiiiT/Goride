import { useState } from 'react';
import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import type { RestaurantMgmtSetupDraft } from '../../types/restaurant-mgmt';
import { FIXTURE_SETUP_DRAFT } from '../../lib/restaurant-mgmt-fixtures';
import { patchSettings } from '../../lib/restaurant-mgmt-api';

const STEPS = [
  { id: 1, label: 'Tax', icon: 'percent' as const },
  { id: 2, label: 'Printer', icon: 'print' as const },
  { id: 3, label: 'Receipt', icon: 'receipt' as const },
];

interface RestaurantMgmtSetupWizardProps {
  merchantId: string;
  useApi: boolean;
  onComplete: () => void;
  onBack?: () => void;
}

export default function RestaurantMgmtSetupWizard({
  merchantId,
  useApi,
  onComplete,
  onBack,
}: RestaurantMgmtSetupWizardProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<RestaurantMgmtSetupDraft>({ ...FIXTURE_SETUP_DRAFT });

  const persistSetup = async () => {
    if (useApi) {
      await patchSettings({
        taxRatePercent: draft.taxRatePercent,
        printerId: draft.printerName || null,
        receiptFooter: draft.receiptFooter,
      });
    } else {
      localStorage.setItem(`roam_restaurant_mgmt_setup_${merchantId}`, JSON.stringify(draft));
    }
    localStorage.setItem(`roam_restaurant_mgmt_setup_done_${merchantId}`, '1');
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await persistSetup();
      toast.success('Restaurant management is ready');
      onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Setup could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    if (step < 3) {
      setStep((s) => s + 1);
      return;
    }
    await handleFinish();
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-on-surface">
      <header className="safe-t border-b border-outline-variant bg-surface px-margin-mobile py-inset-md md:px-margin-tablet">
        <div className="mx-auto flex max-w-2xl items-center gap-inset-sm">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container-high"
              aria-label="Back"
            >
              <MaterialIcon name="arrow_back" />
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-headline-md font-bold">Restaurant setup</h1>
            <p className="text-body-sm text-on-surface-variant">Step {step} of 3</p>
          </div>
        </div>
        <div className="mx-auto mt-inset-md flex max-w-2xl items-center gap-2">
          {STEPS.map((s, index) => (
            <div key={s.id} className={`flex items-center ${index < STEPS.length - 1 ? 'flex-1' : ''}`}>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-label-sm font-semibold ${
                  step > s.id
                    ? 'bg-primary-container text-on-primary-container'
                    : step === s.id
                      ? 'bg-primary-container text-on-primary-container ring-2 ring-primary-container ring-offset-2'
                      : 'bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {step > s.id ? <MaterialIcon name="check" size={16} /> : s.id}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-0.5 flex-1 ${step > s.id ? 'bg-primary-container' : 'bg-surface-container-high'}`}
                />
              )}
            </div>
          ))}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-inset-lg px-margin-mobile py-inset-lg md:px-margin-tablet">
        {step === 1 && (
          <section className="space-y-inset-sm">
            <h2 className="text-title-lg font-semibold">Sales tax rate</h2>
            <p className="text-body-sm text-on-surface-variant">
              Applied to in-store orders at checkout.
            </p>
            <label className="block">
              <span className="text-label-md text-on-surface-variant">Tax rate (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={draft.taxRatePercent}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, taxRatePercent: Number(e.target.value) || 0 }))
                }
                className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-body-lg"
              />
            </label>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-inset-sm">
            <h2 className="text-title-lg font-semibold">Receipt printer</h2>
            <p className="text-body-sm text-on-surface-variant">
              Name or ID of your counter receipt printer.
            </p>
            <label className="block">
              <span className="text-label-md text-on-surface-variant">Printer name</span>
              <input
                type="text"
                value={draft.printerName}
                onChange={(e) => setDraft((d) => ({ ...d, printerName: e.target.value }))}
                placeholder="e.g. Counter Star MC"
                className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-body-lg"
              />
            </label>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-inset-sm">
            <h2 className="text-title-lg font-semibold">Receipt footer</h2>
            <p className="text-body-sm text-on-surface-variant">
              Printed at the bottom of customer receipts.
            </p>
            <textarea
              rows={4}
              value={draft.receiptFooter}
              onChange={(e) => setDraft((d) => ({ ...d, receiptFooter: e.target.value }))}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-3 text-body-md"
            />
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-inset-md">
              <p className="text-label-sm uppercase text-on-surface-variant">Summary</p>
              <p className="mt-2 text-body-sm">Tax: {draft.taxRatePercent}%</p>
              <p className="text-body-sm">Printer: {draft.printerName || 'Not set'}</p>
            </div>
          </section>
        )}
      </main>

      <footer className="safe-b border-t border-outline-variant bg-surface p-inset-md">
        <div className="mx-auto flex max-w-2xl gap-inset-sm">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="min-h-[48px] flex-1 rounded-lg border border-outline-variant text-body-md font-semibold"
            >
              Back
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleContinue}
            className="min-h-[48px] flex-[2] rounded-lg bg-primary-container text-body-md font-semibold text-on-primary disabled:opacity-60"
          >
            {step === 3 ? (saving ? 'Saving…' : 'Finish setup') : 'Continue'}
          </button>
        </div>
      </footer>
    </div>
  );
}
