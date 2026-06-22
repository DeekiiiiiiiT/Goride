import { isLocationComplete } from '@roam/location';
import type { SignUpFormData } from '../signup/types';
import type { DayHours } from '../components/onboarding/ContactHoursBrandingContent';
import type { WizardStepId } from './partner-onboarding-config';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidBusinessEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function canContinueBusinessInfoStep(data: SignUpFormData): boolean {
  return (
    data.restaurantName.trim().length >= 2 &&
    data.businessType !== '' &&
    data.cuisineTypes.length > 0
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

export function canContinueVerificationStep(data: SignUpFormData, enableUpload: boolean): boolean {
  const hasIdFront = enableUpload ? !!data.idFrontDoc : data.idFrontFile !== null;
  const hasIdBack = enableUpload ? !!data.idBackDoc : data.idBackFile !== null;
  const hasProof = enableUpload ? !!data.proofOfBusinessDoc : data.proofOfBusinessFile !== null;
  return data.ownerFullName.trim().length >= 2 && hasIdFront && hasIdBack && hasProof;
}

export function canContinueWizardStep(
  stepId: WizardStepId,
  data: SignUpFormData,
  _hours: DayHours[],
  options?: { enableUpload?: boolean },
): boolean {
  switch (stepId) {
    case 'restaurant-info':
      return canContinueBusinessInfoStep(data);
    case 'location':
      return canContinueLocationStep(data);
    case 'business-details':
      return canContinueBusinessDetailsStep(data);
    case 'contact-hours':
      return canContinueContactHoursStep(data);
    case 'verification':
      return canContinueVerificationStep(data, options?.enableUpload ?? false);
    case 'bank-details':
      return true;
    default:
      return false;
  }
}
