import type { AppConfigResponse, RushAppId } from './types';

const PREFIX = 'rush-app-config:v1:';

export function cacheKey(app: RushAppId): string {
  return `${PREFIX}${app}`;
}

export function readCachedResponse(app: RushAppId): AppConfigResponse | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(app));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'settings' in parsed &&
      typeof (parsed as AppConfigResponse).settings === 'object'
    ) {
      return parsed as AppConfigResponse;
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}

export function writeCachedResponse(app: RushAppId, response: AppConfigResponse): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(cacheKey(app), JSON.stringify(response));
  } catch {
    /* quota / private mode */
  }
}
