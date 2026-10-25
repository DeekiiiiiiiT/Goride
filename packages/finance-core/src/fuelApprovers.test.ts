import { describe, expect, it } from 'vitest';
import { fuelApproverIds } from './fuelApprovers';

describe('fuelApproverIds', () => {
  it('counts the owner even when the seat table is empty', () => {
    expect(fuelApproverIds({ seats: [], ownerId: 'owner-1' })).toEqual(['owner-1']);
  });

  it('counts a manager and ignores a viewer', () => {
    const ids = fuelApproverIds({
      seats: [
        { userId: 'mgr', role: 'fleet_manager', status: 'active' },
        { userId: 'view', role: 'fleet_viewer', status: 'active' },
        { userId: 'acct', role: 'fleet_accountant', status: 'suspended' },
      ],
      ownerId: 'owner-1',
    });
    expect(ids.sort()).toEqual(['mgr', 'owner-1']);
  });
});
