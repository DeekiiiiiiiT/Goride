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

const MAP_IMAGE_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDhKM4e_2af5Cx25gSoRugAptlLf-YNomtHngKZk2czsPdX2CG7jSSgtnpAUnv18UmM3ZbvxK2wv88P1hrYNpqFvuhKhGlxTto3CVtruX-oB7H0_yW3hpqAyH_CYR6oCaUFeIl3ea9xUIevFnVIovtOchlphd1NRel1uejvaDPbfQlFzb2KZrp1gK8HlUHf-ZrOoruQLxnRQ3YAvRoZhlYFYuAFCkYOGWmLuxyXyJ4rwe9dTlQSKgVrkV9G8sEWpb4zcIjcMJKHIVg';

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
  const radiusDisplay = Math.round(formData.deliveryRadiusKm);
  const circleSize = 80 + (radiusDisplay / 20) * 120;

  const showHelp = () => {
    toast.message('Delivery Settings', {
      description:
        'Set how far you deliver, minimum order amounts, fees, and which order types you accept.',
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
        <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm">
          <h2 className="mb-inset-xs text-headline-md text-on-surface">Delivery Radius</h2>
          <div className="mb-inset-sm flex items-center justify-between">
            <span className="text-body-lg text-on-surface-variant">Radius</span>
            <span className="text-headline-md text-primary">{radiusDisplay} km</span>
          </div>
          <input
            aria-label="Delivery Radius Slider"
            type="range"
            min={1}
            max={20}
            step={1}
            value={radiusDisplay}
            onChange={(event) =>
              onChange({ ...formData, deliveryRadiusKm: Number(event.target.value) })
            }
            className="mb-inset-sm h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-variant accent-primary-container [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-container [&::-webkit-slider-thumb]:shadow-sm"
          />
          <div className="relative mb-inset-xs h-48 w-full overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-50"
              style={{ backgroundImage: `url('${MAP_IMAGE_URL}')` }}
            />
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border-2 border-primary-container bg-primary-container/20"
              style={{
                width: circleSize,
                height: circleSize,
                transform: 'translate(-50%, -50%)',
              }}
            />
            <MaterialIcon
              name="location_on"
              filled
              size={32}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-primary-container"
            />
          </div>
          <p className="mt-inset-xs text-body-sm text-on-surface-variant">
            Your store will be visible to customers within this radius.
          </p>
        </section>

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
            <label className="block text-label-md text-on-surface-variant" htmlFor="delivery-fee">
              Delivery Fee{' '}
              <span className="font-body-sm font-normal text-on-surface-variant">
                (Fee charged to customer)
              </span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-body-lg text-on-surface-variant">
                J$
              </span>
              <input
                id="delivery-fee"
                type="number"
                min={0}
                value={formData.deliveryFee || ''}
                onChange={(event) =>
                  onChange({
                    ...formData,
                    deliveryFee: parseFloat(event.target.value) || 0,
                  })
                }
                placeholder="0"
                className={currencyInputClass}
              />
            </div>
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
