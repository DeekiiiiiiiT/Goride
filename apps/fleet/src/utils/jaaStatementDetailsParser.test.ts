import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseJaaStatementDetailsMatrix, isJaaStatementDetails } from './jaaStatementDetailsParser';

describe('parseJaaStatementDetailsMatrix', () => {
  it('extracts fuel lines from StatementDetails sample', () => {
    const rows = JSON.parse(
      readFileSync(join(__dirname, '_jaa_rows.json'), 'utf-8'),
    ) as unknown[][];
    expect(isJaaStatementDetails('Customer Statement Details - Tr', rows)).toBe(true);
    const result = parseJaaStatementDetailsMatrix(rows);
    expect(result.fuelLines.length).toBe(2);
    const byPlate = Object.fromEntries(result.fuelLines.map((l) => [l.vehiclePlate, l]));
    expect(byPlate['1505LM']?.quantity).toBeCloseTo(36.2, 1);
    expect(byPlate['1505LM']?.cost).toBeCloseTo(6726.8, 1);
    expect(byPlate['5404LK']?.quantity).toBeCloseTo(27.62, 1);
    expect(byPlate['5404LK']?.cost).toBeCloseTo(5007.9, 1);
    expect(byPlate['1505LM']?.driverName?.toUpperCase()).toContain('CAMRYN');
  });
});
