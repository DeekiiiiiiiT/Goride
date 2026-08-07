import { describe, expect, it } from 'vitest';
import {
  applyDriverAssignmentChange,
  buildDriverAssignmentWindows,
  driverIdAtVehicleTime,
  vehicleIdForDriverAtTime,
} from './vehicleDriverAssignmentHistory';

describe('vehicleDriverAssignmentHistory', () => {
  it('closes open entry and appends new assignee', () => {
    const vehicle = {
      currentDriverId: 'a',
      driverAssignmentHistory: [
        { driverId: 'a', driverName: 'A', assignedAt: '2026-07-01T10:00:00.000Z' },
      ],
    };
    const next = applyDriverAssignmentChange(vehicle, 'b', 'B', '2026-07-03T12:00:00.000Z');
    expect(next).toHaveLength(2);
    expect(next[0].unassignedAt).toBe('2026-07-03T12:00:00.000Z');
    expect(next[1].driverId).toBe('b');
    expect(next[1].unassignedAt).toBeUndefined();
  });

  it('resolves driver in assignment window', () => {
    const history = [
      {
        driverId: 'a',
        driverName: 'A',
        assignedAt: '2026-07-01T00:00:00.000Z',
        unassignedAt: '2026-07-04T00:00:00.000Z',
      },
      { driverId: 'b', driverName: 'B', assignedAt: '2026-07-04T00:00:00.000Z' },
    ];
    const windows = buildDriverAssignmentWindows(history);
    expect(windows).toHaveLength(2);
    const midA = new Date('2026-07-02T12:00:00.000Z').getTime();
    const midB = new Date('2026-07-05T12:00:00.000Z').getTime();
    expect(driverIdAtVehicleTime({ driverAssignmentHistory: history }, midA)).toBe('a');
    expect(driverIdAtVehicleTime({ driverAssignmentHistory: history }, midB)).toBe('b');
  });

  it('falls back to currentDriverId when no history', () => {
    expect(
      driverIdAtVehicleTime({ currentDriverId: 'x', driverAssignmentHistory: [] }, Date.now()),
    ).toBe('x');
  });

  it('vehicleIdForDriverAtTime follows driver across cars mid-week', () => {
    const vehicles = [
      {
        id: 'v1',
        currentDriverId: 'other',
        driverAssignmentHistory: [
          {
            driverId: 'd1',
            driverName: 'D1',
            assignedAt: '2026-07-01T00:00:00.000Z',
            unassignedAt: '2026-07-03T00:00:00.000Z',
          },
        ],
      },
      {
        id: 'v2',
        currentDriverId: 'd1',
        driverAssignmentHistory: [
          { driverId: 'd1', driverName: 'D1', assignedAt: '2026-07-03T00:00:00.000Z' },
        ],
      },
    ];
    const tue = new Date('2026-07-02T12:00:00.000Z').getTime();
    const thu = new Date('2026-07-04T12:00:00.000Z').getTime();
    expect(vehicleIdForDriverAtTime(vehicles, 'd1', tue)).toBe('v1');
    expect(vehicleIdForDriverAtTime(vehicles, 'd1', thu)).toBe('v2');
    expect(vehicleIdForDriverAtTime(vehicles, 'd1', thu, 'v2')).toBe('v2');
  });
});
