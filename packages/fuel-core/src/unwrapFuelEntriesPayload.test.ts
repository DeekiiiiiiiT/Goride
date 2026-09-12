import { describe, expect, it } from 'vitest';
import { unwrapFuelEntriesPayload } from './unwrapFuelEntriesPayload.ts';

describe('unwrapFuelEntriesPayload', () => {
  it('returns bare arrays unchanged and attaches X-Total-Count', () => {
    const rows = unwrapFuelEntriesPayload([{ id: 'a' }], '3');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: 'a' });
    expect(rows.totalCount).toBe(3);
  });

  it('unwraps envelope { data, total }', () => {
    const rows = unwrapFuelEntriesPayload(
      { data: [{ id: 'b' }], total: 9, sortKey: 'date', sortDir: 'desc' },
      '1',
    );
    expect(rows).toHaveLength(1);
    expect(rows.totalCount).toBe(9);
    expect(rows.sortKey).toBe('date');
    expect(rows.sortDir).toBe('desc');
  });

  it('returns empty array for unexpected shapes', () => {
    expect(unwrapFuelEntriesPayload({ error: 'x' })).toEqual([]);
    expect(unwrapFuelEntriesPayload(null)).toEqual([]);
  });
});
