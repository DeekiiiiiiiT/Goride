import { resolveDelegatedBookingPath } from './nativeDeepLink';

type NavHandler = (path: string) => void;

let handler: NavHandler | null = null;

export function setNativeNavigationHandler(next: NavHandler | null): void {
  handler = next;
}

export function navigateFromAppUrl(url: string): boolean {
  const path = resolveDelegatedBookingPath(url);
  if (!path || !handler) return false;
  handler(path);
  return true;
}
