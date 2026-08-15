import { describe, expect, it } from 'vitest';
import { findActiveFuelCardForSession } from './fuelCardMatch';
import type { FuelCard } from '../types/fuel';

const kennyCard = {
  id: 'card-1',
  cardNumber: '00002920RN2783',
  status: 'Active',
  assignedDriverId: '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
  assignedVehicleId: undefined,
} as FuelCard;

describe('findActiveFuelCardForSession', () => {
  it('finds driver-linked Active cards with no vehicle assignment', () => {
    expect(
      findActiveFuelCardForSession([kennyCard], {
        vehicleId: 'veh-other',
        driverId: '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
      })?.cardNumber,
    ).toBe('00002920RN2783');
  });

  it('matches when only an alias id is provided', () => {
    expect(
      findActiveFuelCardForSession([kennyCard], {
        driverId: 'auth-user-id',
        driverIds: ['52ff47da-ef48-41b8-93d5-80a09b85ce5b', '73e5b1dc-01b4-45ee-a34a-25a3256b9841'],
      })?.id,
    ).toBe('card-1');
  });

  it('treats active status case-insensitively', () => {
    const card = { ...kennyCard, status: 'active' as FuelCard['status'] };
    expect(
      findActiveFuelCardForSession([card], {
        driverId: '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
      })?.id,
    ).toBe('card-1');
  });
});
