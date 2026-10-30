import { describe, expect, it } from 'vitest';
import { canSaveDrafts, importChip, publishInOrder } from './importsApi';

describe('imports', () => {
  it('U10 keeps save disabled until the same file checks with nothing broken', () => {
    expect(canSaveDrafts(null, 'abc', 0)).toBe(false);
    expect(canSaveDrafts('abc', 'abc', 1)).toBe(false);
    expect(canSaveDrafts('abc', 'def', 0)).toBe(false);
    expect(canSaveDrafts('abc', 'abc', 0)).toBe(true);
  });

  it('U12 colours the chip from broken, then unknown, then matched', () => {
    expect(importChip(1, 0)).toEqual({ label: '1 broken', tone: 'red' });
    expect(importChip(0, 2)).toEqual({ label: '2 unknown', tone: 'amber' });
    expect(importChip(0, 0)).toEqual({ label: 'All matched', tone: 'green' });
  });

  it('U14 stops at the first failure and reports what went live', async () => {
    const result = await publishInOrder(
      [
        { pcode: 'JM01', level: 1 },
        { pcode: 'JM0101', level: 2 },
        { pcode: 'JM02', level: 1 },
      ],
      async (area) => {
        if (area.pcode === 'JM0101') throw new Error('stopped');
      },
    );
    expect(result.live).toEqual(['JM01', 'JM02']);
    expect(result.stopped).toBe('JM0101');
  });
});
