import { isLocationComplete } from '@roam/location';
import type { CategoryTaxonomyKey, MerchantBusinessTypeConfig, MerchantDocumentType } from '@roam/types';
import { getCategoryTaxonomyKey, getDefaultConfig } from '@roam/vertical-config';
import type { SignUpFormData } from '../signup/types';
import type { DayHours } from '../components/onboarding/ContactHoursBrandingContent';
import type { WizardStepId } from './partner-onboarding-config';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidBusinessEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function canContinueBusinessInfoStep(
  data: SignUpFormData,
  typeConfig?: MerchantBusinessTypeConfig | null,
): boolean {
  const taxonomy = getCategoryTaxonomyKey(typeConfig ?? null);
  const hasCategories =
    taxonomy === 'inventory_category' || taxonomy === 'product_category'
      ? data.inventoryCategories.length > 0
      : taxonomy === 'none'
        ? true
        : data.cuisineTypes.length > 0;

  return (
    data.restaurantName.trim().length >= 2 &&
    data.businessType !== '' &&
    hasCategories
  );
}

export function canContinueLocationStep(data: SignUpFormData): boolean {
  return isLocationComplete(data.location ?? undefined);
}

export function canContinueBusinessDetailsStep(_data: SignUpFormData): boolean {
  return true;
}

export function canContinueContactHoursStep(data: SignUpFormData): boolean {
  const digits = data.phone.replace(/\D/g, '');
  return digits.length >= 7 && isValidBusinessEmail(data.email);
}

function docUploaded(
  data: SignUpFormData,
  docType: MerchantDocumentType,
  enableUpload: boolean,
): boolean {
  switch (docType) {
    case 'id_front':
      return enableUpload ? !!data.idFrontDoc : data.idFrontFile !== null;
    case 'id_back':
      return enableUpload ? !!data.idBackDoc : data.idBackFile !== null;
    case 'proof_of_business':
      return enableUpload ? !!data.proofOfBusinessDoc : data.proofOfBusinessFile !== null;
    case 'liquor_license':
      return enableUpload ? !!data.liquorLicenseDoc : data.liquorLicenseFile !== null;
    case 'pharmacy_permit':
      return enableUpload ? !!data.pharmacyPermitDoc : data.pharmacyPermitFile !== null;
    default:
      return false;
  }
}

export function canContinueVerificationStep(
  data: SignUpFormData,
  enableUpload: boolean,
  requiredDocs: MerchantDocumentType[] = ['id_front', 'id_back', 'proof_of_business'],
): boolean {
  if (data.ownerFullName.trim().length < 2) return false;
  return requiredDocs.every((doc) => docUploaded(data, doc, enableUpload));
}

export function canContinueWizardStep(
  stepId: WizardStepId,
  data: SignUpFormData,
  _hours: DayHours[],
  options?: {
    enableUpload?: boolean;
    typeConfig?: MerchantBusinessTypeConfig | null;
  },
): boolean {
  const typeConfig = options?.typeConfig ?? getDefaultConfig();
  const requiredDocs = typeConfig.required_document_types;

  switch (stepId) {
    case 'restaurant-info':
      return canContinueBusinessInfoStep(data, typeConfig);
    case 'location':
      return canContinueLocationStep(data);
    case 'business-details':
      return canContinueBusinessDetailsStep(data);
    case 'contact-hours':
      return canContinueContactHoursStep(data);
    case 'verification':
      return canContinueVerificationStep(data, options?.enableUpload ?? false, requiredDocs);
    case 'bank-details':
      return true;
    default:
      return false;
  }
}

export function categoryTaxonomyForConfig(
  typeConfig?: MerchantBusinessTypeConfig | null,
): CategoryTaxonomyKey {
  return getCategoryTaxonomyKey(typeConfig ?? null);
}
