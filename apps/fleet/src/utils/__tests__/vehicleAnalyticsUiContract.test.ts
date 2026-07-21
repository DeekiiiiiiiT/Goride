import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../components/vehicles');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('Vehicle Analytics UI contract', () => {
  it('does not hardcode demo Stitch revenue/mileage values', () => {
    const files = [
      'VehicleAnalytics.tsx',
      'analytics/AnalyticsKpiGrid.tsx',
      'analytics/AnalyticsFinancialSection.tsx',
      'analytics/AnalyticsUtilizationSection.tsx',
      'analytics/AnalyticsVehicleHealthPanel.tsx',
      'analytics/AnalyticsMaintenanceSection.tsx',
    ];
    const banned = ['142,850', '142850', '12,480', '12480', 'FLEET-409', 'Marcus Thompson', '2,420'];
    for (const f of files) {
      const src = read(f);
      for (const b of banned) {
        expect(src.includes(b), `${f} contains demo value ${b}`).toBe(false);
      }
    }
  });

  it('does not invent estimated idle or fake $/km costs', () => {
    const hook = fs.readFileSync(
      path.resolve(__dirname, '../../hooks/useVehicleAnalytics.ts'),
      'utf8',
    );
    const aggregates = fs.readFileSync(
      path.resolve(__dirname, '../vehicleAnalyticsAggregates.ts'),
      'utf8',
    );
    expect(hook.includes('activeHours * 0.4')).toBe(false);
    expect(aggregates.includes('* 0.15')).toBe(false);
    expect(aggregates.includes('* 0.05')).toBe(false);
    expect(aggregates.includes('25000')).toBe(false);
  });

  it('heatmap cells are accessible buttons with min touch sizing', () => {
    const src = read('analytics/AnalyticsUtilizationSection.tsx');
    expect(src.includes('min-h-11')).toBe(true);
    expect(src.includes('aria-label')).toBe(true);
    expect(src.includes('<button')).toBe(true);
  });

  it('labels status board as recorded, not live GPS', () => {
    const src = read('analytics/AnalyticsUtilizationSection.tsx');
    expect(src.includes('Recorded Vehicle Status')).toBe(true);
    expect(src.toLowerCase().includes('live gps')).toBe(true); // in description clarifying it is NOT
  });

  it('period toolbar includes today and custom dates', () => {
    const src = read('analytics/AnalyticsPeriodToolbar.tsx');
    expect(src.includes("'today'")).toBe(true);
    expect(src.includes('type="date"')).toBe(true);
  });

  it('shows coverage warning for unattributed costs', () => {
    const src = read('analytics/AnalyticsFinancialSection.tsx');
    expect(src.includes('unassigned') || src.includes('attributed')).toBe(true);
  });
});
