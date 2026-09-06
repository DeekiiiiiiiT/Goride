/**
 * Shared GET /enterprise/me/modules — FeatureFlag + BusinessConfig both need it.
 * One in-flight request + short TTL cache so fuel recon doesn't pay HTTP/1.1 overhead
 * for two identical shell calls (ROAM-FLEET-10).
 */
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { withProductLineHeaders } from '../config/productLine';

export type EnterpriseModulesPayload = {
  effectiveModules?: Record<string, boolean>;
  orgOverrides?: Record<string, boolean>;
  serviceLines?: string[];
  [key: string]: unknown;
};

const CACHE_TTL_MS = 60_000;

let inflight: Promise<EnterpriseModulesPayload | null> | null = null;
let cache: { token: string; at: number; data: EnterpriseModulesPayload } | null = null;

export function clearEnterpriseModulesCache() {
  cache = null;
  inflight = null;
}

export async function fetchEnterpriseModules(
  accessToken: string,
): Promise<EnterpriseModulesPayload | null> {
  const token = String(accessToken || '').trim();
  if (!token) return null;

  if (cache && cache.token === token && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.fleet}/enterprise/me/modules`, {
        headers: {
          ...withProductLineHeaders(),
          Authorization: `Bearer ${token}`,
          apikey: publicAnonKey,
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as EnterpriseModulesPayload;
      cache = { token, at: Date.now(), data };
      return data;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
