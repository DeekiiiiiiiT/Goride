/**
 * Canonical partner onboarding wizard — single source of step order and field ownership.
 *
 * Field ownership (each field collected on exactly one step):
 * - restaurant-info: restaurantName, description, businessType, cuisineTypes
 * - location: location (lat/lng/address)
 * - business-details: businessRegistrationNumber, taxId, avgPrepTime, deliveryRadius
 * - contact-hours: phone, email, website, hours, logoUrl, coverImageUrl
 * - verification: ownerFullName, identity documents
 * - bank-details: bank account fields (optional skip)
 */

export const WIZARD_STEPS = [
  { id: 1, key: 'restaurant-info', icon: 'store', label: 'Info' },
  { id: 2, key: 'location', icon: 'location_on', label: 'Location' },
  { id: 3, key: 'business-details', icon: 'description', label: 'Details' },
  { id: 4, key: 'contact-hours', icon: 'call', label: 'Contact' },
  { id: 5, key: 'verification', icon: 'verified_user', label: 'Verify' },
  { id: 6, key: 'bank-details', icon: 'account_balance', label: 'Payouts' },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]['key'];

export const WIZARD_TOTAL_STEPS = WIZARD_STEPS.length;

export function wizardStepNumber(stepId: WizardStepId): number {
  const found = WIZARD_STEPS.find((s) => s.key === stepId);
  return found?.id ?? 1;
}

export function nextWizardStep(stepId: WizardStepId): WizardStepId | null {
  const idx = WIZARD_STEPS.findIndex((s) => s.key === stepId);
  if (idx < 0 || idx >= WIZARD_STEPS.length - 1) return null;
  return WIZARD_STEPS[idx + 1].key;
}

export function prevWizardStep(stepId: WizardStepId): WizardStepId | null {
  const idx = WIZARD_STEPS.findIndex((s) => s.key === stepId);
  if (idx <= 0) return null;
  return WIZARD_STEPS[idx - 1].key;
}
