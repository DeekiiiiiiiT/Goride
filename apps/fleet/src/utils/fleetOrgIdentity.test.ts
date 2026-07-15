import { describe, it, expect } from 'vitest';
import {
  FLEET_ORG_UUID,
  collectFleetOrgUuids,
  isFleetOrgUuid,
  orgBankLedgerDriverId,
} from './fleetOrgIdentity';

describe('fleetOrgIdentity', () => {
  it('never treats the Uber fleet org UUID as a driver', () => {
    expect(isFleetOrgUuid(FLEET_ORG_UUID)).toBe(true);
    expect(isFleetOrgUuid('kenny-driver-uuid')).toBe(false);
  });

  it('includes configured platform org UUIDs', () => {
    const set = collectFleetOrgUuids({
      uberOrganizationUuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      roamOrganizationUuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      inDriveOrganizationUuid: null,
    });
    expect(set.has(FLEET_ORG_UUID.toLowerCase())).toBe(true);
    expect(set.has('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(true);
    expect(set.has('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBe(true);
  });

  it('picks ledger id for org bank events', () => {
    expect(orgBankLedgerDriverId('custom-org')).toBe('custom-org');
    expect(orgBankLedgerDriverId(null)).toBe(FLEET_ORG_UUID);
  });
});
