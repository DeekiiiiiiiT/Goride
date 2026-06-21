import { SignUpFormData } from '../types';
import { MaterialIcon } from '../components/MaterialIcon';
import StickyBottomButton from '../components/StickyBottomButton';

interface LocationStepProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
  onBack: () => void;
  onContinue: () => void;
}

const floatingInputClass =
  'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 pb-2 pt-6 text-body-lg text-on-surface shadow-sm transition-all partner-field';

export default function LocationStep({ data, onChange, onBack, onContinue }: LocationStepProps) {
  const canContinue = data.streetAddress.trim().length >= 3 && data.city.trim().length >= 2;

  return (
    <div className="flex min-h-dvh flex-col bg-background font-sans text-on-background">
      <header className="sticky top-0 z-50 flex h-16 w-full items-center bg-background/80 px-margin-mobile backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-start text-on-surface transition-colors duration-150 hover:text-primary active:scale-95"
        >
          <MaterialIcon name="arrow_back" size={24} />
        </button>
        <div className="flex-1" />
        <div className="flex gap-1 text-label-sm text-on-surface-variant">
          <span>Step 2</span>
          <span className="text-outline-variant">/</span>
          <span>4</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col px-margin-mobile pb-[100px] pt-sm md:px-margin-tablet md:pb-xl">
        <h1 className="mb-lg text-headline-lg-mobile font-bold text-primary md:text-headline-lg">
          Restaurant location
        </h1>

        <div className="relative mb-md">
          <MaterialIcon
            name="search"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            type="text"
            className="h-[56px] w-full rounded-lg border border-outline-variant bg-surface pl-12 pr-4 text-body-lg text-on-surface shadow-sm transition-all placeholder:text-on-surface-variant/60 partner-field"
            placeholder="Search address or landmark"
            value={data.addressSearch}
            onChange={(e) => onChange({ addressSearch: e.target.value })}
          />
        </div>

        <div className="group relative mb-lg h-[320px] w-full overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low shadow-sm md:h-[400px]">
          <div className="h-full w-full bg-gradient-to-br from-amber-100 via-orange-50 to-stone-200 opacity-90 transition-opacity group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative -top-4 flex animate-bounce flex-col items-center drop-shadow-md" style={{ animationDuration: '2s' }}>
              <div className="mb-1 whitespace-nowrap rounded-full bg-primary px-3 py-1.5 text-label-sm font-medium text-on-primary shadow-sm">
                Drag map to adjust
              </div>
              <MaterialIcon name="location_on" filled className="text-error" size={40} />
              <div className="mt-[-4px] h-1 w-3 rounded-[100%] bg-black/20 blur-[1px]" />
            </div>
          </div>
          <div className="absolute bottom-4 right-4 flex flex-col gap-2">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface shadow-sm transition-all hover:bg-surface-container-low active:scale-95"
            >
              <MaterialIcon name="add" />
            </button>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface shadow-sm transition-all hover:bg-surface-container-low active:scale-95"
            >
              <MaterialIcon name="remove" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-sm">
          <div className="group relative">
            <label
              className="absolute left-4 top-2 z-10 text-label-sm text-on-surface-variant transition-colors group-focus-within:text-primary"
              htmlFor="street"
            >
              Street address
            </label>
            <input
              id="street"
              type="text"
              className={floatingInputClass}
              value={data.streetAddress}
              onChange={(e) => onChange({ streetAddress: e.target.value })}
            />
            {data.streetAddress && (
              <MaterialIcon
                name="check_circle"
                filled
                className="absolute right-4 top-1/2 -translate-y-1/2 text-primary"
              />
            )}
          </div>

          <div className="group relative">
            <label
              className="absolute left-4 top-2 z-10 text-label-sm text-on-surface-variant transition-colors group-focus-within:text-primary"
              htmlFor="city"
            >
              City / Parish
            </label>
            <input
              id="city"
              type="text"
              className={floatingInputClass}
              value={data.city}
              onChange={(e) => onChange({ city: e.target.value })}
            />
            {data.city && (
              <MaterialIcon
                name="check_circle"
                filled
                className="absolute right-4 top-1/2 -translate-y-1/2 text-primary"
              />
            )}
          </div>

          <div className="group relative">
            <label
              className="absolute left-4 top-2 z-10 text-label-sm text-on-surface-variant transition-colors group-focus-within:text-primary"
              htmlFor="postal"
            >
              Postal code (Optional)
            </label>
            <input
              id="postal"
              type="text"
              className="w-full rounded-lg border border-outline-variant bg-surface px-4 pb-2 pt-6 text-body-lg text-on-surface shadow-sm transition-all placeholder:text-on-surface-variant/40 partner-field"
              placeholder="e.g. JMAWK03"
              value={data.postalCode}
              onChange={(e) => onChange({ postalCode: e.target.value })}
            />
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-outline-variant bg-surface px-margin-mobile py-4 pb-[max(16px,env(safe-area-inset-bottom))] md:static md:mx-auto md:mb-xl md:max-w-[600px] md:border-none md:bg-transparent md:p-0 md:px-margin-tablet">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-primary text-label-md font-semibold text-on-primary shadow-sm transition-all duration-200 hover:bg-primary-fixed hover:text-on-primary-fixed hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Confirm Location
        </button>
      </div>
    </div>
  );
}
