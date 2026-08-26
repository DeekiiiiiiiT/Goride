import { describe, expect, it } from 'vitest';
import { previewRateImpact, type ImpactTollRow } from './tollRateImpact';
import type { TollRateScheduleVersion } from '../types/tollRateSchedule';

function card(withTag: number, effectiveFrom = '2026-01-01'): TollRateScheduleVersion {
  return {
    id: `v-${withTag}`,
    effectiveFrom,
    effectiveDate: effectiveFrom,
    operator: 'TJH',
    currency: 'JMD',
    vehicleClasses: [],
    plazas: [
      {
        plazaId: 'plaza-spanish',
        plazaName: 'Spanish Town',
        rates: { class1: { withTag, withoutTag: withTag + 10 } },
      },
    ],
    routeRateGroups: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const openToll = (over: Partial<ImpactTollRow> = {}): ImpactTollRow => ({
  id: 't1',
  date: '2026-08-05',
  plazaId: 'plaza-spanish',
  plazaName: 'Spanish Town',
  classId: 'class1',
  paymentMethod: 'withTag',
  tagAmount: 275,
  ...over,
});

describe('previewRateImpact', () => {
  it('prices the change on every open toll from the effective date forward', () => {
    const impact = previewRateImpact([openToll(), openToll({ id: 't2' })], card(275), card(300, '2026-08-01'));
    expect(impact.eligible).toBe(2);
    expect(impact.repriced).toBe(2);
    expect(impact.totalDelta).toBe(50);
    expect(impact.byPlaza).toEqual([{ plazaName: 'Spanish Town', count: 2, delta: 50 }]);
  });

  it('leaves tolls dated before the new card alone', () => {
    const impact = previewRateImpact([openToll({ date: '2026-07-15' })], card(275), card(300, '2026-08-01'));
    expect(impact.eligible).toBe(0);
    expect(impact.repriced).toBe(0);
  });

  it('cannot touch a settled toll and says so', () => {
    const impact = previewRateImpact([openToll({ stamped: true })], card(275), card(300, '2026-08-01'));
    expect(impact.frozen).toBe(1);
    expect(impact.eligible).toBe(0);
  });

  it('counts the reconciliations the new card would start flagging as drift', () => {
    const impact = previewRateImpact([openToll({ tagAmount: 275 })], card(275), card(300, '2026-08-01'));
    expect(impact.newlyDrifting).toBe(1);
    expect(impact.driftResolved).toBe(0);
  });

  it('counts drift the new card would clear', () => {
    const impact = previewRateImpact([openToll({ tagAmount: 300 })], card(275), card(300, '2026-08-01'));
    expect(impact.newlyDrifting).toBe(0);
    expect(impact.driftResolved).toBe(1);
  });

  it('measures an unpriced toll against what the tag charged, not against zero', () => {
    const empty = card(275, '2026-08-01');
    empty.plazas = [];
    const impact = previewRateImpact([openToll({ tagAmount: 280 })], empty, card(300, '2026-08-01'));
    expect(impact.newlyPriced).toBe(1);
    expect(impact.totalDelta).toBe(20);
  });
});
