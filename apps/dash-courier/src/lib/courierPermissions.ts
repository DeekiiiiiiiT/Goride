import {
  checkGeolocationGranted,
  checkNotificationGranted,
  requestGeolocationPermission,
  requestNotificationPermission,
  type PermissionGrantState,
} from '@roam/types';

export type { PermissionGrantState };

export type CourierPermissionId = 'location' | 'notifications' | 'camera';

export async function checkCourierPermission(
  id: CourierPermissionId,
): Promise<PermissionGrantState> {
  if (id === 'location') return checkGeolocationGranted();
  if (id === 'notifications') return checkNotificationGranted();
  return checkCameraGranted();
}

export async function requestCourierPermission(
  id: CourierPermissionId,
): Promise<PermissionGrantState> {
  if (id === 'location') return requestGeolocationPermission();
  if (id === 'notifications') return requestNotificationPermission();
  return requestCameraPermission();
}

export async function checkCameraGranted(): Promise<PermissionGrantState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }
  if (!navigator.permissions?.query) {
    return 'prompt';
  }
  try {
    const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
    if (result.state === 'granted') return 'granted';
    if (result.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

export async function requestCameraPermission(): Promise<PermissionGrantState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch {
    return 'denied';
  }
}
