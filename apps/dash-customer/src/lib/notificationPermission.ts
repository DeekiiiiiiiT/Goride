import {
  checkNotificationGranted,
  requestNotificationPermission,
  type PermissionGrantState,
} from '@roam/types';

const DISMISS_KEY = 'roam-dash-notification-prompt-dismissed';

export type { PermissionGrantState };

export async function getNotificationPermissionState(): Promise<PermissionGrantState> {
  return checkNotificationGranted();
}

export async function enableOrderNotifications(): Promise<PermissionGrantState> {
  const result = await requestNotificationPermission();
  if (result === 'denied') {
    setNotificationPromptDismissed(true);
  }
  return result;
}

export function isNotificationPromptDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setNotificationPromptDismissed(dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(DISMISS_KEY, 'true');
    } else {
      localStorage.removeItem(DISMISS_KEY);
    }
  } catch {
    // ignore
  }
}

export function shouldShowNotificationPrompt(state: PermissionGrantState): boolean {
  return state === 'prompt' && !isNotificationPromptDismissed();
}
