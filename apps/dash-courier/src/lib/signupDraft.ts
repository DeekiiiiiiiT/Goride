export type SignupDraft = {
  countryCode: string;
  phone: string;
  email: string;
  fullName: string;
  displayName: string;
  vehicleType: 'bicycle' | 'motorcycle' | 'car';
};

const STORAGE_KEY = 'roam-dash-courier-signup-draft';

const defaultDraft: SignupDraft = {
  countryCode: '+1',
  phone: '',
  email: '',
  fullName: '',
  displayName: '',
  vehicleType: 'motorcycle',
};

export function loadSignupDraft(): SignupDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultDraft };
    return { ...defaultDraft, ...JSON.parse(raw) };
  } catch {
    return { ...defaultDraft };
  }
}

export function saveSignupDraft(patch: Partial<SignupDraft>): SignupDraft {
  const next = { ...loadSignupDraft(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearSignupDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
