import { CUISINE_OPTIONS, SignUpFormData } from '../../signup/types';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { useMerchantBusinessTypes } from '../../hooks/useMerchantBusinessTypes';
import { inputClass, SectionCard, SectionHeader } from './OnboardingShell';

interface BusinessInfoStepProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
}

export default function BusinessInfoStep({ data, onChange }: BusinessInfoStepProps) {
  const { sections, loading } = useMerchantBusinessTypes();

  const toggleCuisine = (cuisine: string) => {
    const selected = data.cuisineTypes.includes(cuisine);
    if (selected) {
      onChange({ cuisineTypes: data.cuisineTypes.filter((c) => c !== cuisine) });
      return;
    }
    if (data.cuisineTypes.length >= 3) return;
    onChange({ cuisineTypes: [...data.cuisineTypes, cuisine] });
  };

  const hasSelectedType = sections.some((section) =>
    section.types.some((t) => t.is_active && t.id === data.businessType),
  );

  return (
    <SectionCard>
      <SectionHeader
        icon="store"
        title="Business Information"
        subtitle="Tell us about your restaurant so customers can find you."
      />
      <hr className="border-outline-variant/50" />
      <div className="flex flex-col gap-inset-sm">
        <div className="flex flex-col gap-inset-base">
          <label className="text-label-md font-semibold text-on-surface" htmlFor="restaurant-name">
            Restaurant Name <span className="text-error">*</span>
          </label>
          <input
            id="restaurant-name"
            type="text"
            value={data.restaurantName}
            onChange={(e) => onChange({ restaurantName: e.target.value })}
            placeholder="e.g. The Spicy Kitchen"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-inset-base">
          <div className="flex items-center justify-between">
            <label className="text-label-md font-semibold text-on-surface" htmlFor="description">
              Description
            </label>
            <span className="text-label-sm text-on-surface-variant">
              {data.description.length}/500 characters
            </span>
          </div>
          <textarea
            id="description"
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value.slice(0, 500) })}
            placeholder="Describe your restaurant's story and what makes it special..."
            rows={4}
            className={`${inputClass} min-h-[120px] resize-none py-3`}
          />
        </div>

        <div className="flex flex-col gap-inset-base">
          <label className="text-label-md font-semibold text-on-surface" htmlFor="business-type">
            Business Type <span className="text-error">*</span>
          </label>
          <div className="relative">
            <select
              id="business-type"
              value={hasSelectedType ? data.businessType : ''}
              onChange={(e) => onChange({ businessType: e.target.value })}
              disabled={loading}
              className={`${inputClass} appearance-none pr-10 disabled:opacity-60`}
            >
              <option disabled value="">
                {loading ? 'Loading types...' : 'Select a type...'}
              </option>
              {sections.map((section) => {
                const activeTypes = section.types.filter((t) => t.is_active);
                if (!activeTypes.length) return null;
                return (
                  <optgroup key={section.id} label={section.label}>
                    {activeTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
              {!hasSelectedType && data.businessType ? (
                <option value={data.businessType}>{data.businessType}</option>
              ) : null}
            </select>
            <MaterialIcon
              name="expand_more"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
              size={20}
            />
          </div>
        </div>

        <div className="flex flex-col gap-inset-base">
          <div className="flex items-center justify-between">
            <label className="text-label-md font-semibold text-on-surface">Cuisine Type</label>
            <span className="text-label-sm text-on-surface-variant">Select up to 3</span>
          </div>
          <div className="grid grid-cols-2 gap-inset-sm sm:grid-cols-3">
            {CUISINE_OPTIONS.map((cuisine) => {
              const isSelected = data.cuisineTypes.includes(cuisine);
              return (
                <button
                  key={cuisine}
                  type="button"
                  onClick={() => toggleCuisine(cuisine)}
                  className={`interactive-card flex h-inset-xl items-center justify-center rounded-lg border text-body-sm transition-colors active:translate-y-px ${
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
        </div>
      </div>
    </SectionCard>
  );
}
