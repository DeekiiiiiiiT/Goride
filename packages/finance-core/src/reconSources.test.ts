import { describe, expect, it } from 'vitest';
import {
  resolveSourceRequirements,
  weekDayKeys,
  computeSourceStatusFromCoverage,
  type OrgReconProfile,
} from './reconSources.ts';

describe('weekDayKeys', () => {
  it('returns Mon..Sun for a Monday anchor', () => {
    expect(weekDayKeys('2026-10-05')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
  });
});

describe('resolveSourceRequirements — self-serve JAA fuel', () => {
  it('requires fuel_card_self when hasSelfServeJaa', () => {
    const profile: OrgReconProfile = {
      serviceLines: ['rideshare'],
      hasUberDrivers: false,
      hasIndriveDrivers: false,
      hasTollTags: false,
      hasRoamFuelCards: false,
      hasSelfServeJaa: true,
      rushDeliveryEnabled: false,
    };
    const reqs = Object.fromEntries(
      resolveSourceRequirements(profile, '2026-10-05').map((r) => [r.sourceId, r.requirement]),
    );
    expect(reqs.fuel_card_self).toBe('required');
    expect(reqs.fuel_card_roam).toBe('not_applicable');
  });
});

describe('resolveSourceRequirements — rideshare org with Uber + tags', () => {
  const profile: OrgReconProfile = {
    serviceLines: ['rideshare'],
    hasUberDrivers: true,
    hasIndriveDrivers: false,
    hasTollTags: true,
    hasRoamFuelCards: true,
    hasSelfServeJaa: false,
    rushDeliveryEnabled: false,
  };

  it('marks platform-specific and org sources correctly', () => {
    const reqs = Object.fromEntries(
      resolveSourceRequirements(profile, '2026-10-05').map((r) => [r.sourceId, r.requirement]),
    );
    expect(reqs.uber_bundle).toBe('required');
    expect(reqs.indrive_trips).toBe('not_applicable');
    expect(reqs.roam_trips).toBe('optional');
    expect(reqs.toll_usage).toBe('required');
    expect(reqs.toll_topup).toBe('required');
    expect(reqs.fuel_card_roam).toBe('required');
    expect(reqs.fuel_card_self).toBe('not_applicable');
    expect(reqs.rush_deliveries).toBe('not_applicable');
    expect(reqs.cod_remittance).toBe('not_applicable');
  });
});

describe('computeSourceStatusFromCoverage', () => {
  it('treats partial required weeks as partial', () => {
    const cov = {
      '2026-10-05': 'covered',
      '2026-10-06': 'missing',
    };
    expect(computeSourceStatusFromCoverage(cov, 'required')).toBe('partial');
  });
});
