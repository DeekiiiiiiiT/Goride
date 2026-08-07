import { describe, expect, it } from 'vitest';
import {
  applyFuelCardAssignmentChange,
  driverIdAtCardTime,
  ensureOpenAssignmentFromCurrent,
} from './fuelCardAssignmentHistory';

describe('fuelCardAssignmentHistory', () => {
  it('closes open entry and appends new assignee with vehicle snapshot', () => {
    const card = {
      assignedDriverId: 'a',
      assignmentHistory: [
        { driverId: 'a', driverName: 'A', assignedAt: '2026-07-01T10:00:00.000Z' },
      ],
    };
    const next = applyFuelCardAssignmentChange(card, 'b', 'B', '2026-07-03T12:00:00.000Z', {
      vehicleIdAtAssign: 'v2',
      vehicleLabelAtAssign: 'ABC123',
    });
    expect(next).toHaveLength(2);
    expect(next[0].unassignedAt).toBe('2026-07-03T12:00:00.000Z');
    expect(next[1].driverId).toBe('b');
    expect(next[1].vehicleIdAtAssign).toBe('v2');
    expect(next[1].vehicleLabelAtAssign).toBe('ABC123');
    expect(next[1].unassignedAt).toBeUndefined();
  });

  it('unassign closes open row without appending', () => {
    const card = {
      assignedDriverId: 'a',
      assignmentHistory: [
        { driverId: 'a', driverName: 'A', assignedAt: '2026-07-01T10:00:00.000Z' },
      ],
    };
    const next = applyFuelCardAssignmentChange(card, null, '', '2026-07-04T00:00:00.000Z');
    expect(next).toHaveLength(1);
    expect(next[0].unassignedAt).toBe('2026-07-04T00:00:00.000Z');
  });

  it('no-ops when same driver already open', () => {
    const card = {
      assignedDriverId: 'a',
      assignmentHistory: [
        { driverId: 'a', driverName: 'A', assignedAt: '2026-07-01T10:00:00.000Z' },
      ],
    };
    const next = applyFuelCardAssignmentChange(card, 'a', 'A', '2026-07-05T00:00:00.000Z');
    expect(next).toHaveLength(1);
    expect(next[0].unassignedAt).toBeUndefined();
  });

  it('seeds legacy open row then closes on first handoff', () => {
    const card = { assignedDriverId: 'a', assignmentHistory: [] as never[] };
    const seeded = ensureOpenAssignmentFromCurrent(card);
    expect(seeded).toHaveLength(1);
    expect(seeded[0].driverId).toBe('a');

    const next = applyFuelCardAssignmentChange(card, 'b', 'B', '2026-07-03T12:00:00.000Z');
    expect(next).toHaveLength(2);
    const mon = new Date('2026-06-30T12:00:00.000Z').getTime();
    const fri = new Date('2026-07-04T12:00:00.000Z').getTime();
    expect(driverIdAtCardTime({ ...card, assignmentHistory: next, assignedDriverId: 'b' }, mon)).toBe(
      'a',
    );
    expect(driverIdAtCardTime({ ...card, assignmentHistory: next, assignedDriverId: 'b' }, fri)).toBe(
      'b',
    );
  });

  it('mid-week windows resolve correct holder', () => {
    const history = [
      {
        driverId: 'a',
        driverName: 'A',
        assignedAt: '2026-07-01T00:00:00.000Z',
        unassignedAt: '2026-07-04T00:00:00.000Z',
      },
      { driverId: 'b', driverName: 'B', assignedAt: '2026-07-04T00:00:00.000Z' },
    ];
    const card = { assignedDriverId: 'b', assignmentHistory: history };
    expect(driverIdAtCardTime(card, new Date('2026-07-02T12:00:00.000Z').getTime())).toBe('a');
    expect(driverIdAtCardTime(card, new Date('2026-07-05T12:00:00.000Z').getTime())).toBe('b');
  });

  it('falls back to assignedDriverId when no history', () => {
    expect(
      driverIdAtCardTime({ assignedDriverId: 'x', assignmentHistory: [] }, Date.now()),
    ).toBe('x');
  });
});
