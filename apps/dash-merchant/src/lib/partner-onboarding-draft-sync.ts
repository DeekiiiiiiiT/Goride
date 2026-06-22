import type { PartnerOnboardingDraft } from '@roam/types';
import type { DayHours } from '../components/onboarding/ContactHoursBrandingContent';
import type { SignUpFormData } from '../signup/types';
import type { WizardStepId } from './partner-onboarding-config';

/** Strip File fields and secrets before sending to server. */
export function formDataToOnboardingDraft(
  formData: SignUpFormData,
  hours: DayHours[],
): PartnerOnboardingDraft {
  return {
    restaurantName: formData.restaurantName || undefined,
    phone: formData.phone || undefined,
    email: formData.email || undefined,
    businessType: formData.businessType || undefined,
    cuisineTypes: formData.cuisineTypes,
    inventoryCategories: formData.inventoryCategories,
    location: formData.location
      ? {
          lat: formData.location.lat,
          lng: formData.location.lng,
          streetAddress: formData.location.streetAddress ?? formData.streetAddress,
          city: formData.location.city ?? formData.city,
          postalCode: formData.location.postalCode ?? formData.postalCode,
          formattedAddress: formData.location.formattedAddress,
        }
      : null,
    streetAddress: formData.streetAddress || undefined,
    city: formData.city || undefined,
    postalCode: formData.postalCode || undefined,
    addressSearch: formData.addressSearch || undefined,
    businessRegistrationNumber: formData.businessRegistrationNumber || undefined,
    taxId: formData.taxId || undefined,
    avgPrepTime: formData.avgPrepTime || undefined,
    deliveryRadius: formData.deliveryRadius || undefined,
    ownerFullName: formData.ownerFullName || undefined,
    description: formData.description || undefined,
    website: formData.website || undefined,
    logoUrl: formData.logoUrl || undefined,
    coverImageUrl: formData.coverImageUrl || undefined,
    bankName: formData.bankName || undefined,
    accountHolderName: formData.accountHolderName || undefined,
    accountType: formData.accountType,
    idFrontDoc: formData.idFrontDoc,
    idBackDoc: formData.idBackDoc,
    proofOfBusinessDoc: formData.proofOfBusinessDoc,
    hours: hours.map((h) => ({ open: h.open, close: h.close, isClosed: h.isClosed })),
  };
}

export function onboardingDraftToFormData(
  draft: PartnerOnboardingDraft | Record<string, unknown> | undefined,
  sessionEmail: string,
): Partial<SignUpFormData> {
  if (!draft) return { email: sessionEmail };
  const d = draft as PartnerOnboardingDraft;
  return {
    restaurantName: d.restaurantName ?? '',
    phone: d.phone ?? '',
    email: d.email || sessionEmail,
    businessType: (d.businessType as SignUpFormData['businessType']) ?? '',
    cuisineTypes: d.cuisineTypes ?? [],
    inventoryCategories: d.inventoryCategories ?? [],
    location: d.location ?? null,
    streetAddress: d.streetAddress ?? d.location?.streetAddress ?? '',
    city: d.city ?? d.location?.city ?? '',
    postalCode: d.postalCode ?? d.location?.postalCode ?? '',
    addressSearch: d.addressSearch ?? '',
    businessRegistrationNumber: d.businessRegistrationNumber ?? '',
    taxId: d.taxId ?? '',
    avgPrepTime: d.avgPrepTime ?? '15',
    deliveryRadius: d.deliveryRadius ?? '5',
    ownerFullName: d.ownerFullName ?? '',
    description: d.description ?? '',
    website: d.website ?? '',
    logoUrl: d.logoUrl ?? '',
    coverImageUrl: d.coverImageUrl ?? '',
    bankName: d.bankName ?? '',
    accountHolderName: d.accountHolderName ?? '',
    accountType: d.accountType ?? 'checking',
    idFrontDoc: d.idFrontDoc ?? null,
    idBackDoc: d.idBackDoc ?? null,
    proofOfBusinessDoc: d.proofOfBusinessDoc ?? null,
  };
}

export function hoursFromOnboardingDraft(
  draft: PartnerOnboardingDraft | Record<string, unknown> | undefined,
  fallback: DayHours[],
): DayHours[] {
  const raw = (draft as PartnerOnboardingDraft | undefined)?.hours;
  if (!Array.isArray(raw) || !raw.length) return fallback;
  return raw.map((h) => ({
    open: h.open ?? '09:00',
    close: h.close ?? '21:00',
    isClosed: Boolean(h.isClosed),
  }));
}

export function isWizardStepId(value: string | null | undefined): value is WizardStepId {
  return [
    'restaurant-info',
    'location',
    'business-details',
    'contact-hours',
    'verification',
    'bank-details',
  ].includes(value ?? '');
}
