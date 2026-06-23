import type { MerchantBusinessTypeConfig } from '@roam/types';
import { getCategoryTaxonomyKey } from '@roam/vertical-config';

/**
 * Canonical partner onboarding wizard — single source of step order and field ownership.
 *
 * Field ownership (each field collected on exactly one step):
 * - restaurant-info: restaurantName, description, businessType, phone, email, website
 * - categories: cuisineTypes, inventoryCategories
 * - location: location (lat/lng/address)
 * - business-details: businessRegistrationNumber, taxId, avgPrepTime, deliveryRadius
 * - operating-hours: hours
 * - branding: logoUrl, coverImageUrl
 * - verification: ownerFullName, identity documents (final step — submits application)
 * Bank account is collected after the merchant's first customer order (see PayoutSetupSheet).
 */

export const WIZARD_STEPS = [
  { id: 1, key: 'restaurant-info', icon: 'store', label: 'Info' },
  { id: 2, key: 'categories', icon: 'local_offer', label: 'Categories' },
  { id: 3, key: 'location', icon: 'location_on', label: 'Location' },
  { id: 4, key: 'business-details', icon: 'description', label: 'Details' },
  { id: 5, key: 'operating-hours', icon: 'schedule', label: 'Hours' },
  { id: 6, key: 'branding', icon: 'image', label: 'Branding' },
  { id: 7, key: 'verification', icon: 'verified_user', label: 'Verify' },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]['key'];

/** Legacy step key from the combined contact/hours/branding step. */
const LEGACY_WIZARD_STEP_ALIASES: Record<string, WizardStepId> = {
  'contact-hours': 'operating-hours',
  'bank-details': 'verification',
};

export function normalizeWizardStepKey(key: string | null | undefined): WizardStepId {
  if (!key) return 'restaurant-info';
  if (key in LEGACY_WIZARD_STEP_ALIASES) {
    return LEGACY_WIZARD_STEP_ALIASES[key];
  }
  const found = WIZARD_STEPS.find((s) => s.key === key);
  return found?.key ?? 'restaurant-info';
}

export const WIZARD_TOTAL_STEPS = WIZARD_STEPS.length;

export function wizardStepNumber(stepId: WizardStepId): number {
  const found = WIZARD_STEPS.find((s) => s.key === stepId);
  return found?.id ?? 1;
}

export function shouldShowCategoriesStep(
  typeConfig?: MerchantBusinessTypeConfig | null,
): boolean {
  return getCategoryTaxonomyKey(typeConfig ?? null) !== 'none';
}

function resolveAdjacentStep(
  stepId: WizardStepId,
  direction: 1 | -1,
  skipCategories: boolean,
): WizardStepId | null {
  const idx = WIZARD_STEPS.findIndex((s) => s.key === stepId);
  if (idx < 0) return null;

  let nextIdx = idx + direction;
  while (nextIdx >= 0 && nextIdx < WIZARD_STEPS.length) {
    const key = WIZARD_STEPS[nextIdx].key;
    if (key === 'categories' && skipCategories) {
      nextIdx += direction;
      continue;
    }
    return key;
  }
  return null;
}

export function nextWizardStep(
  stepId: WizardStepId,
  options?: { typeConfig?: MerchantBusinessTypeConfig | null },
): WizardStepId | null {
  return resolveAdjacentStep(
    stepId,
    1,
    !shouldShowCategoriesStep(options?.typeConfig),
  );
}

export function prevWizardStep(
  stepId: WizardStepId,
  options?: { typeConfig?: MerchantBusinessTypeConfig | null },
): WizardStepId | null {
  return resolveAdjacentStep(
    stepId,
    -1,
    !shouldShowCategoriesStep(options?.typeConfig),
  );
}
