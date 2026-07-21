import { describe, expect, it } from 'vitest';
import { allocateEvenly } from '../expenseHubJournal';

describe('Expense Hub bulk allocation (50+ vehicles)', () => {
  it('splits across 53 vehicles without penny drift', () => {
    const ids = Array.from({ length: 53 }, (_, i) => `veh_${i + 1}`);
    const rows = allocateEvenly(125_000.37, ids);
    expect(rows).toHaveLength(53);
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBeCloseTo(125_000.37, 2);
    expect(new Set(rows.map((r) => r.vehicleId)).size).toBe(53);
  });

  it('handles single vehicle', () => {
    const rows = allocateEvenly(99.99, ['only']);
    expect(rows).toEqual([{ vehicleId: 'only', amount: 99.99 }]);
  });

  it('handles empty vehicle list', () => {
    expect(allocateEvenly(10, [])).toEqual([]);
  });
});
