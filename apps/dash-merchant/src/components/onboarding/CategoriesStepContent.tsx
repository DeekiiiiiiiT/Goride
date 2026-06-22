import type { MerchantBusinessTypeConfig } from '@roam/types';
import {
  getComplianceTier,
  getVerticalLabels,
  resolveVerticalType,
} from '@roam/vertical-config';
import { SignUpFormData } from '../../signup/types';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { categoryTaxonomyForConfig } from '../../lib/partner-onboarding-validation';

interface CategoriesStepContentProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
  typeConfig?: MerchantBusinessTypeConfig | null;
}

export default function CategoriesStepContent({
  data,
  onChange,
  typeConfig,
}: CategoriesStepContentProps) {
  const labels = getVerticalLabels(typeConfig?.vertical_type, typeConfig?.fulfillment_type);
  const taxonomy = categoryTaxonomyForConfig(typeConfig);
  const isRegulated = getComplianceTier(typeConfig) === 'regulated';
  const vertical = resolveVerticalType(typeConfig?.vertical_type);

  const categoryOptions = (typeConfig?.category_tags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean);

  const maxCategories = taxonomy === 'cuisine' ? 3 : 5;
  const selectedCategories =
    taxonomy === 'cuisine' ? data.cuisineTypes : data.inventoryCategories;

  const toggleCategory = (category: string) => {
    const field = taxonomy === 'cuisine' ? 'cuisineTypes' : 'inventoryCategories';
    const current = taxonomy === 'cuisine' ? data.cuisineTypes : data.inventoryCategories;
    const selected = current.includes(category);
    if (selected) {
      onChange({ [field]: current.filter((c) => c !== category) });
      return;
    }
    if (current.length >= maxCategories) return;
    onChange({ [field]: [...current, category] });
  };

  const title =
    vertical === 'pharmacy' || isRegulated
      ? 'Business categories'
      : `What ${labels.categoryFieldLabel.toLowerCase()} describe your store?`;

  const subtitle =
    vertical === 'pharmacy' || isRegulated
      ? 'Select the categories that best match your business.'
      : `Choose up to ${maxCategories} so customers can find you more easily.`;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
          {title}
        </h1>
        <p className="mt-2 text-body-lg text-on-surface-variant">{subtitle}</p>
      </header>

      <section className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-label-md text-on-surface-variant">
            {isRegulated ? 'Business Category' : `${labels.categoryFieldLabel} (Max ${maxCategories})`}
          </label>
          <span className="text-label-md text-on-surface-variant">
            {selectedCategories.length}/{maxCategories}
          </span>
        </div>
        {categoryOptions.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">
            No tags are configured for this business type yet. Please contact support or try again later.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categoryOptions.map((category) => {
              const isSelected = selectedCategories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-label-lg transition-all active:scale-95 ${
                    isSelected
                      ? 'border-primary bg-primary-container text-on-primary'
                      : 'border-outline text-on-surface-variant hover:bg-surface-container-low'
                  }`}
                >
                  <MaterialIcon name={isSelected ? 'check' : 'add'} size={18} />
                  {category}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
