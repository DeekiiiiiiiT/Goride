import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { MerchantSettingsFormData, PREP_TIME_OPTIONS } from '../../hooks/useMerchantSettings';

interface DeliverySettingsViewProps {
  formData: MerchantSettingsFormData;
  onChange: (data: MerchantSettingsFormData) => void;
  onBack: () => void;
  onSave: () => Promise<void>;
  isSaving?: boolean;
}

const inputClass =
  'h-12 w-full rounded border border-outline-variant bg-transparent px-4 text-body-lg text-on-surface outline-none transition-colors focus:border-primary-container focus:ring-1 focus:ring-primary-container';

const currencyInputClass = `${inputClass} pl-10`;

function SettingsToggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div className="peer h-6 w-12 rounded-full bg-surface-variant transition-colors peer-checked:bg-primary-container peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-container/20 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all peer-checked:after:translate-x-6" />
    </label>
  );
}

export default function DeliverySettingsView({
  formData,
  onChange,
  onBack,
  onSave,
  isSaving = false,
}: DeliverySettingsViewProps) {
  const showHelp = () => {
    toast.message('Delivery Settings', {
      description:
        'Set minimum order amounts, fees, prep time, and which order types you accept. Delivery coverage is managed by Roam.',
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col bg-surface pb-24 text-on-surface">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:bg-surface-container-high active:scale-95"
          aria-label="Back"
        >
          <MaterialIcon name="arrow_back" className="text-on-surface" />
        </button>
        <h1 className="text-headline-md font-bold text-primary">Delivery Settings</h1>
        <button
          type="button"
          onClick={showHelp}
          className="flex h-12 w-12 items-center justify-center rounded-full transition-colors hover:bg-surface-container-high active:scale-95"
          aria-label="Help"
        >
          <MaterialIcon name="help_outline" className="text-on-surface" />
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-inset-md px-margin-mobile pb-20 pt-20 md:px-margin-tablet">
        <section className="space-y-inset-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm">
          <h2 className="mb-inset-xs text-headline-md text-on-surface">Order Requirements</h2>

          <div className="space-y-inset-base">
            <label className="block text-label-md text-on-surface-variant" htmlFor="min-order">
              Minimum Order Amount
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-body-lg text-on-surface-variant">
                J$
              </span>
              <input
                id="min-order"
                type="number"
                min={0}
                value={formData.minOrderAmount || ''}
                onChange={(event) =>
                  onChange({
                    ...formData,
                    minOrderAmount: parseFloat(event.target.value) || 0,
                  })
                }
                placeholder="0"
                className={currencyInputClass}
              />
            </div>
          </div>

          <div className="space-y-inset-base">
            <p className="block text-label-md text-on-surface-variant">Delivery Fee</p>
            <p className="rounded border border-outline-variant bg-surface-container px-4 py-3 text-body-md text-on-surface-variant">
              Set by Roam as a platform-wide delivery fee (same for every plan). Customers see that
              fee — not a store-level amount.
            </p>
          </div>

          <div className="space-y-inset-base">
            <p className="block text-label-md text-on-surface-variant">Delivery coverage</p>
            <p className="rounded border border-outline-variant bg-surface-container px-4 py-3 text-body-md text-on-surface-variant">
              Roam sets your delivery radius. Your plan suggests a starting reach; live coverage is
              managed by our team.
            </p>
          </div>

          <div className="space-y-inset-base">
            <label className="block text-label-md text-on-surface-variant" htmlFor="menu-inflation">
              Menu inflation (%)
            </label>
            <input
              id="menu-inflation"
              type="number"
              min={0}
              max={25}
              step={0.1}
              value={formData.menuInflationPercent}
              onChange={(event) => {
                const raw = Number(event.target.value);
                const clamped = Number.isFinite(raw)
                  ? Math.min(25, Math.max(0, raw))
                  : 0;
                onChange({ ...formData, menuInflationPercent: clamped });
              }}
              className={inputClass}
            />
            <p className="text-body-sm text-on-surface-variant">
              How much app menu prices can sit above in-store (0–25%). Customers see the inflated
              prices on Roam Rush.
            </p>
          </div>

          <div className="space-y-inset-base">
            <label className="block text-label-md text-on-surface-variant" htmlFor="prep-time">
              Estimated Prep Time
            </label>
            <div className="relative">
              <select
                id="prep-time"
                value={formData.avgPrepTimeMins}
                onChange={(event) =>
                  onChange({
                    ...formData,
                    avgPrepTimeMins: Number(event.target.value),
                  })
                }
                className={`${inputClass} appearance-none pr-10`}
              >
                {PREP_TIME_OPTIONS.map((mins) => (
                  <option key={mins} value={mins}>
                    {mins} min
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-on-surface-variant">
                <MaterialIcon name="expand_more" />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-inset-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm">
          <h2 className="mb-inset-xs text-headline-md text-on-surface">Operational Toggles</h2>

          <div className="flex items-center justify-between py-2">
            <div className="flex flex-col pr-inset-sm">
              <span className="text-body-lg text-on-surface">Accepts pickup orders</span>
              <span className="text-body-sm text-on-surface-variant">
                Allow customers to collect in-store
              </span>
            </div>
            <SettingsToggle
              id="toggle-pickup"
              checked={formData.acceptsPickup}
              onChange={(checked) => onChange({ ...formData, acceptsPickup: checked })}
            />
          </div>

          <hr className="border-outline-variant" />

          <div className="flex items-center justify-between py-2">
            <div className="flex flex-col pr-inset-sm">
              <span className="text-body-lg text-on-surface">Accepts scheduled orders</span>
              <span className="text-body-sm text-on-surface-variant">
                Allow orders placed in advance
              </span>
            </div>
            <SettingsToggle
              id="toggle-scheduled"
              checked={formData.acceptsScheduled}
              onChange={(checked) => onChange({ ...formData, acceptsScheduled: checked })}
            />
          </div>

          <hr className="border-outline-variant" />

          <div className="space-y-inset-base py-2">
            <label className="block text-body-lg text-on-surface" htmlFor="max-capacity">
              Max daily order capacity
            </label>
            <input
              id="max-capacity"
              type="text"
              value={formData.maxDailyCapacity}
              onChange={(event) =>
                onChange({ ...formData, maxDailyCapacity: event.target.value })
              }
              placeholder="No limit"
              className={inputClass}
            />
            <p className="text-body-sm text-on-surface-variant">
              When this limit is reached, customers cannot place new delivery orders until tomorrow.
              In-store POS is not limited.
            </p>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-outline-variant bg-surface/90 p-margin-mobile backdrop-blur-sm">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
            className="h-12 w-full rounded bg-primary-container text-headline-md font-bold text-on-primary shadow-sm transition-colors hover:bg-primary active:scale-[0.98] disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
