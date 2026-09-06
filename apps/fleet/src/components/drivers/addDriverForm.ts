/** Shared form model for Add Driver wizard (RHF, no zod in fleet). */

export const ADD_DRIVER_DRAFT_KEY = 'fleet.addDriver.draft.v1';

export const COUNTRY_CODES = [
  { code: '+1', label: 'US (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+91', label: 'IN (+91)' },
  { code: '+81', label: 'JP (+81)' },
  { code: '+86', label: 'CN (+86)' },
  { code: '+876', label: 'JM (+876)' },
  { code: '+61', label: 'AU (+61)' },
  { code: '+49', label: 'DE (+49)' },
] as const;

export type LicenseSubStep = 'front-upload' | 'front-review' | 'back-upload' | 'back-review';

export type AddDriverFormValues = {
  firstName: string;
  middleName: string;
  middleName2: string;
  lastName: string;
  countryCode: string;
  phoneNumber: string;
  email: string;
  nationality: string;
  status: string;
  licenseNumber: string;
  licenseExpiry: string;
  dob: string;
  sex: string;
  collectorate: string;
  licenseClass: string;
  licenseToDrive: string;
  controlNumber: string;
  originalIssueDate: string;
  address: string;
  proofType: string;
};

export type AddDriverDraft = {
  step: number;
  licenseStep: LicenseSubStep;
  values: AddDriverFormValues;
};

export const defaultAddDriverValues: AddDriverFormValues = {
  firstName: '',
  middleName: '',
  middleName2: '',
  lastName: '',
  countryCode: '+1',
  phoneNumber: '',
  email: '',
  nationality: '',
  status: 'Active',
  licenseNumber: '',
  licenseExpiry: '',
  dob: '',
  sex: '',
  collectorate: '',
  licenseClass: '',
  licenseToDrive: '',
  controlNumber: '',
  originalIssueDate: '',
  address: '',
  proofType: '',
};

export function loadAddDriverDraft(): AddDriverDraft | null {
  try {
    const raw = sessionStorage.getItem(ADD_DRIVER_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AddDriverDraft;
    if (!parsed?.values || typeof parsed.step !== 'number') return null;
    return {
      step: parsed.step,
      licenseStep: parsed.licenseStep || 'front-upload',
      values: { ...defaultAddDriverValues, ...parsed.values },
    };
  } catch {
    return null;
  }
}

export function saveAddDriverDraft(draft: AddDriverDraft): void {
  try {
    sessionStorage.setItem(ADD_DRIVER_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearAddDriverDraft(): void {
  try {
    sessionStorage.removeItem(ADD_DRIVER_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
