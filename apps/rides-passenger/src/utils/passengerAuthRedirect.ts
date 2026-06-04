import { isNativeCapacitorPlatform } from '@roam/types';

export const PASSENGER_PRODUCTION_ORIGIN = 'https://roam-s.co';
export const PASSENGER_NATIVE_AUTH_CALLBACK = 'co.roamenterprise.rides://login';

export function getPassengerAuthRedirectUrl(): string {
  if (isNativeCapacitorPlatform()) {
    return PASSENGER_NATIVE_AUTH_CALLBACK;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/login`;
  }
  return `${PASSENGER_PRODUCTION_ORIGIN}/login`;
}

export function isPassengerAuthCallbackUrl(url: string): boolean {
  return (
    url.startsWith(PASSENGER_NATIVE_AUTH_CALLBACK) ||
    url.startsWith(`${PASSENGER_PRODUCTION_ORIGIN}/`)
  );
}
