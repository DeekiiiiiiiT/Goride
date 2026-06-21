const STORAGE_KEY = 'roam-dash-courier-onboarding-complete';

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // ignore
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function syncOnboardingFromProfile(): Promise<boolean> {
  try {
    const { loadCourierProfile } = await import('@/lib/courierProfileService');
    const profile = await loadCourierProfile();
    if (profile?.onboarding_complete && profile.status === 'active') {
      markOnboardingComplete();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function isProfilePending(): Promise<boolean> {
  try {
    const { loadCourierProfile } = await import('@/lib/courierProfileService');
    const profile = await loadCourierProfile();
    return profile?.status === 'pending';
  } catch {
    return false;
  }
}
