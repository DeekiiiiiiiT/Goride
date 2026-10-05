import { describe, it, expect } from 'vitest';
import { buildLowBalanceQueue } from './tollLowBalanceQueue';

describe('buildLowBalanceQueue', () => {
  it('lists tags at or under threshold, empties first', () => {
    const queue = buildLowBalanceQueue([
      {
        id: '1',
        tagNumber: 'A',
        provider: 'T-Tag',
        status: 'Active',
        balance: 400,
        lowBalanceThreshold: 500,
        assignedVehicleName: '5179KZ',
      },
      {
        id: '2',
        tagNumber: 'B',
        provider: 'T-Tag',
        status: 'Active',
        balance: 0,
        lowBalanceThreshold: 500,
      },
      {
        id: '3',
        tagNumber: 'C',
        provider: 'T-Tag',
        status: 'Active',
        balance: 2000,
        lowBalanceThreshold: 500,
      },
      {
        id: '4',
        tagNumber: 'D',
        provider: 'T-Tag',
        status: 'Inactive',
        balance: 0,
        lowBalanceThreshold: 500,
      },
    ]);
    expect(queue.map((q) => q.tagNumber)).toEqual(['B', 'A']);
    expect(queue[0].ring).toBe('empty');
    expect(queue[1].shortfall).toBe(100);
  });

  it('keeps an unknown balance on the queue and leaves J$550 off it', () => {
    const queue = buildLowBalanceQueue([
      {
        id: 'live',
        tagNumber: '212100286450',
        provider: 'T-Tag',
        status: 'Active',
        balance: 550,
        orgDefaultThreshold: 500,
      },
      {
        id: 'new',
        tagNumber: 'NEW',
        provider: 'T-Tag',
        status: 'Active',
        balance: null,
        orgDefaultThreshold: 500,
      },
      {
        id: 'override',
        tagNumber: 'HIGH',
        provider: 'JRC',
        status: 'Active',
        balance: 600,
        lowBalanceThreshold: 800,
        orgDefaultThreshold: 500,
      },
    ]);
    expect(queue.map((q) => q.tagNumber)).toEqual(['HIGH', 'NEW']);
    expect(queue.find((q) => q.tagNumber === 'NEW')?.ring).toBe('unknown');
    expect(queue.find((q) => q.tagNumber === 'NEW')?.shortfall).toBeNull();
    expect(queue.find((q) => q.tagNumber === 'HIGH')?.threshold).toBe(800);
  });
});
