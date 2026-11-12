import { describe, expect, it } from 'vitest';
import { buildFleetNavModel } from './fleetNavModel';

function financeIds(reconV2Enabled?: boolean): string[] {
  const model = buildFleetNavModel({
    canView: () => true,
    isModuleEnabled: () => true,
    businessType: 'rideshare',
    serviceLines: ['rideshare'],
    rushVisible: false,
    rideshareVisible: true,
    labels: { dashboardTitle: 'Dashboard', drivers: 'Drivers', vehiclesPageTitle: 'Vehicles' },
    reconV2Enabled,
  });
  return model.businessFinance.items.map((i) => i.id);
}

describe('recon_v2 switch-over (audit §9)', () => {
  it('switch off (the default): no Week Reconciliation in the menu, Driver Settlements stays', () => {
    expect(financeIds(undefined)).not.toContain('week-reconciliation');
    expect(financeIds(false)).not.toContain('week-reconciliation');
    expect(financeIds(false)).toContain('driver-settlements');
  });

  it('switch on: Week Reconciliation is in the menu', () => {
    expect(financeIds(true)).toContain('week-reconciliation');
  });
});
