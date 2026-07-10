import { describe, expect, it } from 'vitest';
import {
  migrateToVersionedStore,
  publishScheduleVersion,
  resolveOfficialTollRate,
  selectScheduleVersion,
  hasOfficialRateDrift,
} from './officialTollRate';

const sampleStore = migrateToVersionedStore({
  effectiveDate: '01/01/2026',
  operator: 'Test',
  currency: 'JMD',
  vehicleClasses: [{ id: 'class1', label: 'Class 1', iconName: 'car', description: '', examples: '', height: '', length: '', fleetRelevance: '', fleetRelevanceColor: '' }],
  plazas: [
    {
      plazaId: 'plaza-spanish',
      plazaName: 'Spanish Town',
      rates: { class1: { withTag: 275, withoutTag: 285 } },
    },
  ],
  routeRateGroups: [],
});

describe('officialTollRate', () => {
  it('migrates legacy schedule into a versioned store', () => {
    expect(sampleStore.versions.length).toBe(1);
    expect(sampleStore.current.plazas[0].plazaName).toBe('Spanish Town');
  });

  it('resolves flat T-Tag rate by plazaId', () => {
    const rate = resolveOfficialTollRate({
      store: sampleStore,
      asOfDate: '2026-06-01',
      tollClassId: 'class1',
      paymentMethod: 'withTag',
      plazaId: 'plaza-spanish',
    });
    expect(rate?.amount).toBe(275);
    expect(rate?.source).toBe('flat');
  });

  it('date-locks: new version only applies from effectiveFrom forward', () => {
    const next = publishScheduleVersion(sampleStore, {
      ...sampleStore.current,
      effectiveFrom: '2026-07-01',
      effectiveDate: '01/07/2026',
      plazas: [
        {
          plazaId: 'plaza-spanish',
          plazaName: 'Spanish Town',
          rates: { class1: { withTag: 300, withoutTag: 310 } },
        },
      ],
    });
    const before = selectScheduleVersion(next, '2026-06-15');
    const after = selectScheduleVersion(next, '2026-07-15');
    expect(resolveOfficialTollRate({
      store: next,
      asOfDate: '2026-06-15',
      tollClassId: 'class1',
      plazaId: 'plaza-spanish',
    })?.amount).toBe(275);
    expect(resolveOfficialTollRate({
      store: next,
      asOfDate: '2026-07-15',
      tollClassId: 'class1',
      plazaId: 'plaza-spanish',
    })?.amount).toBe(300);
    expect(before.effectiveFrom <= '2026-06-15').toBe(true);
    expect(after.effectiveFrom).toBe('2026-07-01');
  });

  it('detects tag vs official drift', () => {
    expect(hasOfficialRateDrift(285, 275)).toBe(true);
    expect(hasOfficialRateDrift(275, 275)).toBe(false);
  });
});
