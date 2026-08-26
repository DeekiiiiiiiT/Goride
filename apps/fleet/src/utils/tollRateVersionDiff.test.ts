import { describe, expect, it } from 'vitest';
import { diffRateVersions } from './tollRateVersionDiff';
import type { TollRateScheduleVersion } from '../types/tollRateSchedule';

function card(overrides: Partial<TollRateScheduleVersion> = {}): TollRateScheduleVersion {
  return {
    id: 'v1',
    effectiveFrom: '2026-01-01',
    effectiveDate: '01/01/2026',
    operator: 'TransJamaican Highway Limited',
    currency: 'JMD',
    vehicleClasses: [
      { id: 'class1', label: 'Class 1', iconName: 'car', description: '', examples: '', height: '', length: '', fleetRelevance: '', fleetRelevanceColor: '' },
    ],
    plazas: [
      {
        plazaId: 'plaza-spanish',
        plazaName: 'Spanish Town',
        rates: { class1: { withTag: 275, withoutTag: 285 } },
      },
    ],
    routeRateGroups: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('diffRateVersions', () => {
  it('reports no change between a card and itself', () => {
    expect(diffRateVersions(card(), card()).identical).toBe(true);
  });

  it('reports the price move and its direction', () => {
    const next = card({
      plazas: [
        { plazaId: 'plaza-spanish', plazaName: 'Spanish Town', rates: { class1: { withTag: 300, withoutTag: 285 } } },
      ],
    });
    const diff = diffRateVersions(card(), next);
    expect(diff.rows).toHaveLength(1);
    expect(diff.rows[0]).toMatchObject({ kind: 'changed', from: 275, to: 300, delta: 25, paymentMethod: 'withTag' });
  });

  it('reads a rename as a rename, not a removal plus an addition', () => {
    const renamed = card({
      plazas: [
        { plazaId: 'plaza-spanish', plazaName: 'Spanish Town Plaza', rates: { class1: { withTag: 275, withoutTag: 285 } } },
      ],
    });
    const diff = diffRateVersions(card(), renamed);
    expect(diff.rows).toHaveLength(0);
    expect(diff.plazasAdded).toEqual([]);
    expect(diff.plazasRemoved).toEqual([]);
  });

  it('lists a plaza that appears only in the newer card', () => {
    const next = card({
      plazas: [
        ...card().plazas,
        { plazaId: 'plaza-ferry', plazaName: 'Ferry', rates: { class1: { withTag: 200, withoutTag: 210 } } },
      ],
    });
    const diff = diffRateVersions(card(), next);
    expect(diff.plazasAdded).toEqual(['Ferry']);
    expect(diff.rows.filter(r => r.kind === 'added')).toHaveLength(2);
  });

  it('diffs route segments alongside plaza rates', () => {
    const withRoute = card({
      routeRateGroups: [
        {
          id: 'nsh',
          operator: 'NSH',
          highway: 'North-South',
          effectiveDate: '01/01/2026',
          segments: [
            { fromPlazaName: 'Caymanas', toPlazaName: 'Angels', distanceKm: 12, rates: { class1: 500 } },
          ],
        },
      ],
    });
    const diff = diffRateVersions(card(), withRoute);
    const routeRow = diff.rows.find(r => r.scope === 'route');
    expect(routeRow).toMatchObject({ kind: 'added', to: 500, plazaLabel: 'Caymanas → Angels' });
  });
});
