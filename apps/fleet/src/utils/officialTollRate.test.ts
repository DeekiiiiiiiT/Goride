import { describe, expect, it } from 'vitest';
import {
  migrateToVersionedStore,
  resolveOfficialTollRate,
  hasOfficialRateDrift,
} from './officialTollRate';

/** Smoke: fleet shim re-exports @roam/toll-core (full suite in packages/toll-core). */
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

describe('officialTollRate re-export', () => {
  it('resolves flat T-Tag rate by plazaId', () => {
    const rate = resolveOfficialTollRate({
      store: sampleStore,
      asOfDate: '2026-06-01',
      tollClassId: 'class1',
      paymentMethod: 'withTag',
      plazaId: 'plaza-spanish',
    });
    expect(rate?.amount).toBe(275);
  });

  it('detects tag vs official drift', () => {
    expect(hasOfficialRateDrift(285, 275)).toBe(true);
  });
});
