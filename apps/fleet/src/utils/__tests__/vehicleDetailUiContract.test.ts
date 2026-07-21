import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const detailPath = path.resolve(__dirname, '../../components/vehicles/VehicleDetail.tsx');

describe('VehicleDetail UI contract after analytics simplification', () => {
  const src = fs.readFileSync(detailPath, 'utf8');

  it('retains the five operational/performance tabs', () => {
    expect(src.includes('TabsTrigger value="performance"')).toBe(true);
    expect(src.includes('TabsTrigger value="expenses"')).toBe(true);
    expect(src.includes('TabsTrigger value="odometer"')).toBe(true);
    expect(src.includes('TabsTrigger value="km-tracking"')).toBe(true);
    expect(src.includes('TabsTrigger value="profile"')).toBe(true);
  });

  it('removes Overview, Utilization, and Financials tabs', () => {
    expect(src.includes('TabsTrigger value="overview"')).toBe(false);
    expect(src.includes('TabsTrigger value="utilization"')).toBe(false);
    expect(src.includes('TabsTrigger value="financials"')).toBe(false);
    expect(src.includes('TabsContent value="overview"')).toBe(false);
    expect(src.includes('TabsContent value="utilization"')).toBe(false);
    expect(src.includes('TabsContent value="financials"')).toBe(false);
  });

  it('does not contain known fake cost/idle formulas', () => {
    expect(src.includes('* 0.15')).toBe(false);
    expect(src.includes('* 0.05')).toBe(false);
    expect(src.includes('activeHours * 0.4')).toBe(false);
    expect(src.includes('25000')).toBe(false);
    expect(src.includes('(150 * 6)')).toBe(false);
    expect(src.includes('(200 * 6)')).toBe(false);
    expect(src.includes('12.5 km/L')).toBe(false);
    expect(src.includes('Top 10% of fleet')).toBe(false);
  });
});
