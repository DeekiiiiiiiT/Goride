import { describe, expect, it } from 'vitest';
import { resolveFuelFillDriver } from './resolveFuelFillDriver';
import { UNASSIGNED_FUEL_DRIVER_ID } from '../types/fuel';

describe('resolveFuelFillDriver', () => {
  const vehicles = [
    {
      id: 'v1',
      currentDriverId: 'current',
      driverAssignmentHistory: [
        {
          driverId: 'hist',
          driverName: 'Hist',
          assignedAt: '2026-07-01T00:00:00.000Z',
          unassignedAt: '2026-07-04T00:00:00.000Z',
        },
        { driverId: 'current', driverName: 'Current', assignedAt: '2026-07-04T00:00:00.000Z' },
      ],
    },
  ];

  it('prefers explicit driverId', () => {
    const r = resolveFuelFillDriver({
      entry: { driverId: 'explicit', vehicleId: 'v1', date: '2026-07-02' },
      vehicles,
    });
    expect(r).toEqual({ driverId: 'explicit', source: 'explicit', confidence: 'high' });
  });

  it('uses gas card assignedDriverId', () => {
    const r = resolveFuelFillDriver({
      entry: { cardId: 'c1', vehicleId: 'v1', date: '2026-07-02' },
      vehicles,
      fuelCards: [{ id: 'c1', cardNumber: '1234', provider: 'Shell', status: 'Active', assignedDriverId: 'card-d' }],
    });
    expect(r.source).toBe('gas_card');
    expect(r.driverId).toBe('card-d');
  });

  it('uses trip proximity before history', () => {
    const r = resolveFuelFillDriver({
      entry: { vehicleId: 'v1', date: '2026-07-02', time: '14:00:00' },
      vehicles,
      trips: [
        {
          id: 't1',
          driverId: 'trip-d',
          vehicleId: 'v1',
          date: '2026-07-02',
          status: 'Completed',
          requestTime: '2026-07-02T13:00:00.000Z',
          dropoffTime: '2026-07-02T15:00:00.000Z',
        } as any,
      ],
    });
    expect(r.source).toBe('trip');
    expect(r.driverId).toBe('trip-d');
  });

  it('uses assignment history when no trip', () => {
    const r = resolveFuelFillDriver({
      entry: { vehicleId: 'v1', date: '2026-07-02', time: '12:00:00' },
      vehicles,
    });
    expect(r.source).toBe('assignment_history');
    expect(r.driverId).toBe('hist');
  });

  it('falls back to current assignment', () => {
    const r = resolveFuelFillDriver({
      entry: { vehicleId: 'v1', date: '2026-07-10' },
      vehicles: [{ id: 'v1', currentDriverId: 'only-current' }],
    });
    expect(r.source).toBe('current_assignment');
    expect(r.driverId).toBe('only-current');
  });

  it('returns unassigned when nothing matches', () => {
    const r = resolveFuelFillDriver({
      entry: { date: '2026-07-02' },
      vehicles: [],
    });
    expect(r.driverId).toBe(UNASSIGNED_FUEL_DRIVER_ID);
    expect(r.source).toBe('unassigned');
  });
});
