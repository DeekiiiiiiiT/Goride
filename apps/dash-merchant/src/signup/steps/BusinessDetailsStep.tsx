import { DELIVERY_RADIUS_OPTIONS, PREP_TIME_OPTIONS, SignUpFormData } from '../types';
import { MaterialIcon } from '../components/MaterialIcon';

interface BusinessDetailsStepProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
  onBack: () => void;
  onContinue: () => void;
}

const fieldClass =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-lg text-on-surface placeholder:text-on-surface-variant/50 transition-all partner-field';

export default function BusinessDetailsStep({
  data,
  onChange,
  onBack,
  onContinue,
}: BusinessDetailsStepProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container">
      <header className="flex h-16 w-full shrink-0 items-center px-margin-mobile pt-4 md:px-margin-tablet md:pt-8">
        <button
          type="button"
          aria-label="Go back"
          onClick={onBack}
          className="-ml-3 flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low active:scale-95"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <div className="flex w-full justify-end">
          <span className="text-label-md font-semibold text-on-surface-variant">Step 2 of 3</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-margin-mobile pb-xl pt-8 md:px-margin-tablet">
        <div className="mb-lg">
          <h1 className="mb-2 text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
            Business details
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            Tell us a bit more about your operations so we can configure your dashboard correctly.
          </p>
        </div>

        <form className="flex flex-1 flex-col gap-md" onSubmit={(e) => e.preventDefault()}>
          <div className="flex flex-col gap-xs">
            <label className="flex justify-between text-label-md font-semibold text-on-surface" htmlFor="biz_reg">
              Business registration number
              <span className="font-normal normal-case tracking-normal text-on-surface-variant">
                Optional
              </span>
            </label>
            <input
              id="biz_reg"
              type="text"
              className={fieldClass}
              placeholder="e.g. 123456789"
              value={data.businessRegistrationNumber}
              onChange={(e) => onChange({ businessRegistrationNumber: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label className="flex justify-between text-label-md font-semibold text-on-surface" htmlFor="tax_id">
              Tax ID / TRN
              <span className="font-normal normal-case tracking-normal text-on-surface-variant">
                Optional
              </span>
            </label>
            <input
              id="tax_id"
              type="text"
              className={fieldClass}
              placeholder="e.g. TAX-987654"
              value={data.taxId}
              onChange={(e) => onChange({ taxId: e.target.value })}
            />
          </div>

          <div className="mt-4 flex flex-col gap-xs">
            <label className="text-label-md font-semibold text-on-surface">Average prep time</label>
            <p className="mb-2 text-body-sm text-on-surface-variant">
              Helps us calculate accurate pickup times for couriers.
            </p>
            <div className="flex flex-wrap gap-2">
              {PREP_TIME_OPTIONS.map((minutes) => (
                <label key={minutes} className="relative cursor-pointer select-none">
                  <input
                    type="radio"
                    name="prep_time"
                    value={minutes}
                    checked={data.avgPrepTime === minutes}
                    onChange={() => onChange({ avgPrepTime: minutes })}
                    className="peer sr-only"
                  />
                  <div className="flex h-12 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest px-5 text-body-sm text-on-surface-variant transition-colors hover:bg-surface-container-low peer-checked:border-primary-container peer-checked:bg-primary-container peer-checked:font-medium peer-checked:text-on-primary-container peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface">
                    {minutes} min
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="mb-xl mt-4 flex flex-col gap-xs">
            <label className="text-label-md font-semibold text-on-surface" htmlFor="delivery_radius">
              Delivery radius preference
            </label>
            <div className="relative">
              <select
                id="delivery_radius"
                className={`${fieldClass} cursor-pointer appearance-none pr-12`}
                value={data.deliveryRadius}
                onChange={(e) => onChange({ deliveryRadius: e.target.value })}
              >
                <option disabled value="">
                  Select maximum distance
                </option>
                {DELIVERY_RADIUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <MaterialIcon
                name="expand_more"
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
            </div>
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={onContinue}
            className="mt-8 flex h-12 w-full items-center justify-center rounded-lg bg-primary text-label-md font-semibold text-on-primary shadow-sm transition-all duration-150 hover:bg-primary/90 active:scale-[0.98]"
          >
            Continue
          </button>
        </form>
      </main>
    </div>
  );
}
