import type { RushRolloutResponse } from './rushRolloutCatalog';

export type FleetRushRolloutApiConfig = {
  apiBaseUrl: string;
  accessToken: string;
};

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchRushRollout(
  config: FleetRushRolloutApiConfig,
  orgId: string,
): Promise<RushRolloutResponse> {
  const res = await fetch(
    `${config.apiBaseUrl}/admin/organizations/${encodeURIComponent(orgId)}/rush-rollout`,
    { headers: authHeaders(config.accessToken) },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as RushRolloutResponse;
}

export async function patchOrgServiceLines(
  config: FleetRushRolloutApiConfig,
  orgId: string,
  serviceLines: string[],
): Promise<{ serviceLines: string[]; businessType: string; enabledModules: Record<string, boolean> }> {
  const res = await fetch(
    `${config.apiBaseUrl}/admin/organizations/${encodeURIComponent(orgId)}/service-lines`,
    {
      method: 'PATCH',
      headers: authHeaders(config.accessToken),
      body: JSON.stringify({ serviceLines }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function enableFlagForOrg(
  config: FleetRushRolloutApiConfig,
  flagName: string,
  orgId: string,
): Promise<void> {
  const res = await fetch(
    `${config.apiBaseUrl}/admin/feature-flags/${encodeURIComponent(flagName)}/enable-for-org`,
    {
      method: 'POST',
      headers: authHeaders(config.accessToken),
      body: JSON.stringify({ orgId }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
}

export async function disableFlagForOrg(
  config: FleetRushRolloutApiConfig,
  flagName: string,
  orgId: string,
): Promise<void> {
  const res = await fetch(
    `${config.apiBaseUrl}/admin/feature-flags/${encodeURIComponent(flagName)}/disable-for-org`,
    {
      method: 'POST',
      headers: authHeaders(config.accessToken),
      body: JSON.stringify({ orgId }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
}
