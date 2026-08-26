import { describe, expect, it } from 'vitest';
import {
  migrateToVersionedStore,
  publishScheduleVersion,
  publishScheduleVersionChecked,
  resolveOfficialTollRate,
  selectScheduleVersion,
  hasOfficialRateDrift,
  TollRatePublishError,
} from './officialTollRate.ts';

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

describe('publish guards', () => {
  const repriced = (amount: number) => ({
    ...sampleStore.current,
    plazas: [
      {
        plazaId: 'plaza-spanish',
        plazaName: 'Spanish Town',
        rates: { class1: { withTag: amount, withoutTag: amount + 10 } },
      },
    ],
  });

  it('refuses to start a card before the one already in force', () => {
    expect(() =>
      publishScheduleVersionChecked(sampleStore, {
        ...repriced(300),
        effectiveFrom: '2025-12-01',
      }),
    ).toThrow(TollRatePublishError);
  });

  it('refuses a second card on a date that already has one', () => {
    expect(() =>
      publishScheduleVersionChecked(sampleStore, {
        ...repriced(300),
        effectiveFrom: '2026-01-01',
      }),
    ).toThrow(/already starts on 2026-01-01/);
  });

  it('refuses to publish a plaza that is not linked to a plaza record', () => {
    expect(() =>
      publishScheduleVersionChecked(sampleStore, {
        ...sampleStore.current,
        effectiveFrom: '2026-08-01',
        plazas: [{ plazaName: 'Ferry', rates: { class1: { withTag: 300, withoutTag: 310 } } }],
      }),
    ).toThrow(/Link these plazas/);
  });

  it('writes no version when the prices are unchanged', () => {
    const result = publishScheduleVersionChecked(sampleStore, {
      ...sampleStore.current,
      effectiveFrom: '2026-09-01',
    });
    expect(result.published).toBe(false);
    expect(result.store.versions.length).toBe(1);
  });

  it('lets a genuine price change through and keeps it date-locked', () => {
    const result = publishScheduleVersionChecked(sampleStore, {
      ...repriced(300),
      effectiveFrom: '2026-09-01',
    });
    expect(result.published).toBe(true);
    expect(result.store.versions.length).toBe(2);
    expect(result.store.current.effectiveFrom).toBe('2026-09-01');
  });
});
