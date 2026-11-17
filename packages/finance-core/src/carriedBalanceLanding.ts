import { CORRECTIONS_LAND_ON } from './pastWeeksCleanup.ts';

export function carriedBalanceMustLandOnReason(landOn: string): string {
  return `Carried balances must land on the week of ${landOn}.`;
}

export type CarriedBalanceLandingResult =
  | { ok: true; landingWeek: string; reason: '' }
  | { ok: false; landingWeek: null; reason: string };

export function resolveCarriedBalanceLanding(input: {
  landOn: string;
  periodAnchor: string | null | undefined;
  frozen: boolean;
}): CarriedBalanceLandingResult {
  const landOn = String(input.landOn).slice(0, 10);
  const anchor = String(input.periodAnchor || '').slice(0, 10);
  const reason = carriedBalanceMustLandOnReason(landOn);
  if (!anchor || anchor !== landOn) {
    return { ok: false, landingWeek: null, reason };
  }
  if (input.frozen) {
    return { ok: false, landingWeek: null, reason };
  }
  return { ok: true, landingWeek: landOn, reason: '' };
}

/** Re-export for tests that mirror Kenny’s multi-open-week case. */
export { CORRECTIONS_LAND_ON };