import {
  BUSINESS_TYPES,
  CUISINE_OPTIONS,
  SignUpFormData,
} from '../types';
import { MaterialIcon } from '../components/MaterialIcon';
import StickyBottomButton from '../components/StickyBottomButton';

interface RestaurantInfoStepProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
  onBack: () => void;
  onContinue: () => void;
}

const inputClass =
  'h-xl w-full rounded-lg border border-outline-variant bg-transparent px-sm text-body-lg text-on-surface placeholder:text-on-surface-variant/50 transition-colors partner-field';

export default function RestaurantInfoStep({
  data,
  onChange,
  onBack,
  onContinue,
}: RestaurantInfoStepProps) {
  const toggleCuisine = (cuisine: string) => {
    const selected = data.cuisineTypes.includes(cuisine);
    if (selected) {
      onChange({ cuisineTypes: data.cuisineTypes.filter((c) => c !== cuisine) });
      return;
    }
    if (data.cuisineTypes.length >= 3) return;
    onChange({ cuisineTypes: [...data.cuisineTypes, cuisine] });
  };

  const canContinue =
    data.restaurantName.trim().length >= 2 &&
    data.phone.trim().length >= 7 &&
    data.email.includes('@') &&
    data.businessType !== '' &&
    data.cuisineTypes.length > 0;

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-surface text-on-surface antialiased">
      <header className="z-50 flex h-16 w-full items-center px-margin-mobile pb-2 pt-4">
        <button
          type="button"
          aria-label="Go back"
          onClick={onBack}
          className="flex h-xl w-xl items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <div className="flex flex-1 justify-center">
          <div className="h-1 w-3/4 max-w-[200px] overflow-hidden rounded-full bg-surface-variant">
            <div className="h-full w-1/3 rounded-full bg-primary-container" />
          </div>
        </div>
        <div className="w-xl" />
      </header>

      <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col gap-lg px-margin-mobile pb-xl pt-md">
        <section className="flex flex-col gap-xs">
          <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
            Register your restaurant
          </h1>
          <p className="text-body-sm text-on-surface-variant">
            Let&apos;s start with some basic information about your business.
          </p>
        </section>

        <form className="flex flex-col gap-lg" onSubmit={(e) => e.preventDefault()}>
          <section className="flex flex-col gap-sm">
            <div className="flex flex-col gap-base">
              <label className="text-label-md font-semibold text-on-surface-variant" htmlFor="restaurant-name">
                Restaurant Name
              </label>
              <input
                id="restaurant-name"
                type="text"
                className={inputClass}
                placeholder="e.g. The Golden Spoon"
                value={data.restaurantName}
                onChange={(e) => onChange({ restaurantName: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-base">
              <label className="text-label-md font-semibold text-on-surface-variant" htmlFor="phone-number">
                Business Phone Number
              </label>
              <input
                id="phone-number"
                type="tel"
                className={inputClass}
                placeholder="(876) 555-1234"
                value={data.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-base">
              <label className="text-label-md font-semibold text-on-surface-variant" htmlFor="email">
                Business Email
              </label>
              <input
                id="email"
                type="email"
                className={inputClass}
                placeholder="contact@restaurant.com"
                value={data.email}
                onChange={(e) => onChange({ email: e.target.value })}
              />
            </div>
          </section>

          <section className="flex flex-col gap-base">
            <label className="text-label-md font-semibold text-on-surface-variant" htmlFor="business-type">
              Business Type
            </label>
            <div className="relative">
              <select
                id="business-type"
                className={`${inputClass} appearance-none`}
                value={data.businessType}
                onChange={(e) =>
                  onChange({ businessType: e.target.value as SignUpFormData['businessType'] })
                }
              >
                <option disabled value="">
                  Select a type...
                </option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-sm text-on-surface-variant">
                <MaterialIcon name="expand_more" />
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-base">
            <div className="flex items-center justify-between">
              <label className="text-label-md font-semibold text-on-surface-variant">Cuisine Type</label>
              <span className="text-label-sm text-on-surface-variant">Select up to 3</span>
            </div>
            <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
              {CUISINE_OPTIONS.map((cuisine) => {
                const isSelected = data.cuisineTypes.includes(cuisine);
                return (
                  <button
                    key={cuisine}
                    type="button"
                    onClick={() => toggleCuisine(cuisine)}
                    className={`interactive-card flex h-xl items-center justify-center rounded-lg border text-body-sm transition-colors active:translate-y-px ${
                      isSelected
                        ? 'border-primary-container bg-primary-container text-on-primary-container'
                        : 'border-outline-variant text-on-surface hover:bg-surface-container-low'
                    }`}
                  >
                    {cuisine}
                  </button>
                );
              })}
            </div>
          </section>
        </form>
      </main>

      <StickyBottomButton label="Continue" onClick={onContinue} disabled={!canContinue} />
    </div>
  );
}
