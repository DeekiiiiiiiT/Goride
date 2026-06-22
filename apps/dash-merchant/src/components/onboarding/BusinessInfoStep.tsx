import { useState } from 'react';
import type { MerchantBusinessTypeConfig } from '@roam/types';
import {
  getBusinessTypeConfig,
  getComplianceTier,
  getVerticalLabels,
  resolveVerticalType,
} from '@roam/vertical-config';
import {
  CUISINE_OPTIONS,
  INVENTORY_CATEGORY_OPTIONS,
  PHARMACY_CATEGORY_OPTIONS,
  SignUpFormData,
} from '../../signup/types';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { useMerchantBusinessTypes } from '../../hooks/useMerchantBusinessTypes';
import RegulatedVerticalBanner from './RegulatedVerticalBanner';
import { categoryTaxonomyForConfig } from '../../lib/partner-onboarding-validation';
import { inputClass } from './OnboardingShell';

interface BusinessInfoStepProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
}

function storeIconForConfig(config: MerchantBusinessTypeConfig | null): string {
  const vertical = resolveVerticalType(config?.vertical_type);
  if (vertical === 'pharmacy') return 'local_pharmacy';
  if (vertical === 'alcohol') return 'liquor';
  if (vertical === 'grocery' || vertical === 'convenience' || vertical === 'retail') return 'local_grocery_store';
  return 'restaurant';
}

function tailoringSubtitle(config: MerchantBusinessTypeConfig | null): string {
  const vertical = resolveVerticalType(config?.vertical_type);
  if (vertical === 'pharmacy' || vertical === 'alcohol') return 'Tailoring setup for regulated partners';
  if (vertical === 'grocery' || vertical === 'convenience' || vertical === 'retail') {
    return 'Tailoring setup for Retail & Grocery';
  }
  return 'Tailoring setup for Food Service';
}

export default function BusinessInfoStep({ data, onChange }: BusinessInfoStepProps) {
  const { sections, loading } = useMerchantBusinessTypes();
  const [editingType, setEditingType] = useState(false);
  const typeConfig = getBusinessTypeConfig(sections, data.businessType);
  const labels = getVerticalLabels(typeConfig?.vertical_type, typeConfig?.fulfillment_type);
  const taxonomy = categoryTaxonomyForConfig(typeConfig);
  const isRegulated = getComplianceTier(typeConfig) === 'regulated';
  const vertical = resolveVerticalType(typeConfig?.vertical_type);

  const hasSelectedType = sections.some((section) =>
    section.types.some((t) => t.is_active && t.id === data.businessType),
  );

  const showTypeSummary = hasSelectedType && isRegulated && !editingType;

  const categoryOptions =
    vertical === 'pharmacy'
      ? PHARMACY_CATEGORY_OPTIONS
      : taxonomy === 'inventory_category'
        ? INVENTORY_CATEGORY_OPTIONS
        : CUISINE_OPTIONS;

  const maxCategories = taxonomy === 'cuisine' ? 3 : 5;

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

  const handleBusinessTypeChange = (businessType: string) => {
    const nextConfig = getBusinessTypeConfig(sections, businessType);
    const patch: Partial<SignUpFormData> = { businessType };
    if (nextConfig) {
      patch.avgPrepTime = String(nextConfig.default_prep_time_mins);
      patch.deliveryRadius = String(nextConfig.max_delivery_radius_km);
    }
    setEditingType(false);
    onChange(patch);
  };

  const selectedCategories =
    taxonomy === 'cuisine' ? data.cuisineTypes : data.inventoryCategories;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
          {isRegulated ? 'Business Profile' : 'Tell us about your business'}
        </h1>
        <p className="mt-2 text-body-lg text-on-surface-variant">
          {isRegulated
            ? `Tell us about your ${labels.storeNoun.toLowerCase()} to get started with the onboarding process.`
            : 'Choose your business type — this sets up your store correctly.'}
        </p>
      </header>

      {!showTypeSummary && (
        <section className="space-y-2">
          <label className="ml-1 text-label-md text-on-surface-variant" htmlFor="business-type">
            Business Category
          </label>
          <div className="relative">
            <select
              id="business-type"
              value={hasSelectedType ? data.businessType : ''}
              onChange={(e) => handleBusinessTypeChange(e.target.value)}
              disabled={loading}
              className={`${inputClass} h-14 appearance-none pr-10 disabled:opacity-60`}
            >
              <option disabled value="">
                {loading ? 'Loading types...' : 'Select business type'}
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
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
              size={20}
            />
          </div>
        </section>
      )}

      {showTypeSummary && typeConfig && (
        <div className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-container text-on-primary">
              <MaterialIcon name={storeIconForConfig(typeConfig)} />
            </div>
            <div>
              <p className="text-label-md text-on-surface-variant">Business Type</p>
              <p className="text-title-md font-semibold text-on-surface">{typeConfig.label}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditingType(true)}
            className="rounded-full px-4 py-2 text-label-lg font-semibold text-primary hover:bg-surface-container-low"
          >
            Change
          </button>
        </div>
      )}

      {isRegulated && typeConfig ? <RegulatedVerticalBanner verticalLabel={typeConfig.label} /> : null}

      {hasSelectedType && (
        <section className="space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          {!isRegulated && (
            <div className="flex items-center gap-3 border-b border-surface-container pb-4">
              <div className="rounded-lg bg-primary-container p-2">
                <MaterialIcon name={storeIconForConfig(typeConfig)} className="text-on-primary" />
              </div>
              <div>
                <h2 className="text-title-md font-semibold text-on-surface">Store Details</h2>
                <p className="text-label-md text-on-surface-variant">{tailoringSubtitle(typeConfig)}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-label-md text-on-surface-variant" htmlFor="restaurant-name">
                {labels.storeNoun} Name
              </label>
              <input
                id="restaurant-name"
                type="text"
                value={data.restaurantName}
                onChange={(e) => onChange({ restaurantName: e.target.value })}
                placeholder="Fresh Mart Kingston"
                className={`${inputClass} h-14`}
              />
            </div>

            <div>
              <div className="mb-2 flex justify-between">
                <label className="text-label-md text-on-surface-variant" htmlFor="description">
                  {isRegulated ? 'Business Description' : 'Description'}
                </label>
                <span className="text-label-md text-on-surface-variant">{data.description.length}/500</span>
              </div>
              <textarea
                id="description"
                value={data.description}
                onChange={(e) => onChange({ description: e.target.value.slice(0, 500) })}
                placeholder={
                  isRegulated
                    ? 'Briefly describe your services and specialization...'
                    : 'Tell customers about your store, specialty items, and values...'
                }
                rows={4}
                className={`${inputClass} min-h-[120px] resize-none py-3`}
              />
            </div>

            {(taxonomy === 'inventory_category' ||
              taxonomy === 'product_category' ||
              taxonomy === 'cuisine' ||
              vertical === 'pharmacy') && (
              <div>
                <label className="mb-3 block text-label-md text-on-surface-variant">
                  {isRegulated ? 'Business Category' : `${labels.categoryFieldLabel} (Max ${maxCategories})`}
                </label>
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
              </div>
            )}
          </div>
        </section>
      )}

      {!isRegulated && (
        <div className="flex items-start gap-4 rounded-xl border border-tertiary-fixed bg-warning-container p-4">
          <MaterialIcon name="info" className="shrink-0 text-tertiary-container" />
          <p className="text-body-md text-on-surface-variant">
            Your business type determines the tax rates and category fees applied to your items later in
            the onboarding process.
          </p>
        </div>
      )}
    </div>
  );
}
