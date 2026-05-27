import type {
  AppPermissionPolicyFlags,
  AppPermissionPolicyRow,
  AppPermissionSurface,
} from './appPermissionCatalog';

export type PermissionGrantState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export function isWebApplicable(platform: AppPermissionPolicyRow['platform']): boolean {
  return platform === 'web' || platform === 'both';
}

export async function checkGeolocationGranted(): Promise<PermissionGrantState> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  if (!navigator.permissions?.query) {
    return 'prompt';
  }
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    if (result.state === 'granted') return 'granted';
    if (result.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

export async function checkNotificationGranted(): Promise<PermissionGrantState> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

export function requestGeolocationPermission(): Promise<PermissionGrantState> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve('unsupported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => resolve(err.code === 1 ? 'denied' : 'prompt'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export async function requestNotificationPermission(): Promise<PermissionGrantState> {
  if (!('Notification' in window)) return 'unsupported';
  const result = await Notification.requestPermission();
  if (result === 'granted') return 'granted';
  if (result === 'denied') return 'denied';
  return 'prompt';
}

export function permissionKeyToGrantChecker(
  key: string,
): () => Promise<PermissionGrantState> {
  if (key.startsWith('location')) return checkGeolocationGranted;
  if (key === 'notifications') return checkNotificationGranted;
  return async () => 'unsupported';
}

export function shouldBlockForPermission(
  row: AppPermissionPolicyRow,
  grantState: PermissionGrantState,
): boolean {
  if (!row.enabled || !row.block_until_granted) return false;
  if (!isWebApplicable(row.platform)) return false;
  return grantState === 'denied' || grantState === 'prompt';
}

export function shouldShowOnboardingPrompt(
  row: AppPermissionPolicyRow,
  grantState: PermissionGrantState,
  onboardingDismissed: boolean,
): boolean {
  if (!row.enabled || !row.prompt_onboarding || onboardingDismissed) return false;
  if (!isWebApplicable(row.platform)) return false;
  return grantState !== 'granted';
}

export function onboardingStorageKey(surface: AppPermissionSurface): string {
  return `roam.permissions.onboarding.${surface}.v1`;
}

export function readOnboardingDismissed(
  surface: AppPermissionSurface,
  permissionKey: string,
): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(onboardingStorageKey(surface));
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return map[permissionKey] === true;
  } catch {
    return false;
  }
}

export function markOnboardingDismissed(
  surface: AppPermissionSurface,
  permissionKey: string,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const key = onboardingStorageKey(surface);
    const raw = localStorage.getItem(key);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[permissionKey] = true;
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function findPolicyRow(
  permissions: AppPermissionPolicyRow[],
  key: string,
): AppPermissionPolicyRow | undefined {
  return permissions.find((p) => p.key === key);
}

export function isBlockedByPolicy(
  permissions: AppPermissionPolicyRow[],
  key: string,
  grantState: PermissionGrantState,
): boolean {
  const row = findPolicyRow(permissions, key);
  if (!row) return false;
  return shouldBlockForPermission(row, grantState);
}
