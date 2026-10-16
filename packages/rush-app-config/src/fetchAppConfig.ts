import type { AppConfigPlatform, AppConfigResponse, RushAppId } from './types';

export type FetchAppConfigParams = {
  deliveryBaseUrl: string;
  app: RushAppId;
  version?: string;
  platform?: AppConfigPlatform;
  marketId?: string | null;
  etag?: string | null;
  signal?: AbortSignal;
};

export type FetchAppConfigResult =
  | { ok: true; status: 200; body: AppConfigResponse; etag: string | null }
  | { ok: true; status: 304; body: null; etag: string | null }
  | { ok: false; error: string };

export async function fetchAppConfig(
  params: FetchAppConfigParams,
): Promise<FetchAppConfigResult> {
  const base = params.deliveryBaseUrl.replace(/\/$/, '');
  const qs = new URLSearchParams({ app: params.app });
  if (params.version) qs.set('version', params.version);
  if (params.platform) qs.set('platform', params.platform);
  if (params.marketId) qs.set('market', params.marketId);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (params.etag) headers['If-None-Match'] = params.etag;

    const res = await fetch(`${base}/app-config?${qs.toString()}`, {
      method: 'GET',
      headers,
      signal: params.signal,
    });

    const etag = res.headers.get('ETag');

    if (res.status === 304) {
      return { ok: true, status: 304, body: null, etag };
    }

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const body = (await res.json()) as AppConfigResponse;
    if (!body || typeof body !== 'object' || typeof body.settings !== 'object') {
      return { ok: false, error: 'Invalid app-config body' };
    }

    return { ok: true, status: 200, body, etag };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: message };
  }
}
