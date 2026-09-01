export type RoamFleetSignupLine = 'rideshare' | 'rush_delivery';

/**
 * Env-aware RoamFleet signup URL for funnel CTAs from Driver / Courier apps.
 */
export function roamFleetSignupUrl(opts?: {
  line?: RoamFleetSignupLine;
  from?: string;
}): string {
  const envBase =
    typeof import.meta !== 'undefined' &&
    typeof (import.meta as { env?: Record<string, string> }).env?.VITE_ROAM_FLEET_SIGNUP_URL === 'string'
      ? String((import.meta as { env: Record<string, string> }).env.VITE_ROAM_FLEET_SIGNUP_URL).trim()
      : '';
  const base = envBase ? envBase.replace(/\/$/, '') : 'https://roamfleet.co';
  const params = new URLSearchParams();
  if (opts?.line) params.set('line', opts.line);
  if (opts?.from) params.set('from', opts.from);
  const qs = params.toString();
  return qs ? `${base}/signup?${qs}` : `${base}/signup`;
}
