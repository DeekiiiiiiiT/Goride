import { describe, expect, it } from 'vitest';
import {
  computeFuelLineConservation,
  conservationHolds,
  fuelEntryMatchesLineFilter,
  isUnattributedFuelEntry,
  type FuelLineConservation,
} from './fuelServiceLineFilter';
import { fuelCardMatchesLine } from './fuelCardServiceLine';
import { integrityFlagSetsEqual, integrityVehiclesForLine } from './fuelIntegrityServiceLine';
import { buildUnallocatedHonesty, isFuelServiceLineAllocationEnabled, projectUnattributedSpendByTripMix } from './fuelServiceLineAllocation';

describe('fuel service-line conservation', () => {
  it('partitions counts and spend', () => {
    const entries = [
      { amount: 100, serviceLine: 'rideshare', serviceLineSource: 'vehicle' },
      { amount: 50, serviceLine: 'rush_delivery', serviceLineSource: 'vehicle' },
      { amount: 25, serviceLine: null, serviceLineSource: 'unattributed' },
    ];
    const c = computeFuelLineConservation(entries);
    expect(c.allCount).toBe(3);
    expect(c.rideshareCount + c.deliveryCount + c.unattributedCount).toBe(3);
    expect(conservationHolds(c)).toBe(true);
    expect(c.allSpend).toBe(175);
  });

  it('matches filters', () => {
    const u = { serviceLine: null, serviceLineSource: 'unattributed' };
    expect(fuelEntryMatchesLineFilter(u, 'unattributed')).toBe(true);
    expect(fuelEntryMatchesLineFilter(u, 'rideshare')).toBe(false);
  });

  it('treats conflicting rideshare+unattributed source as unattributed only (S2)', () => {
    const bad = { amount: 40, serviceLine: 'rideshare', serviceLineSource: 'unattributed' };
    expect(isUnattributedFuelEntry(bad)).toBe(true);
    expect(fuelEntryMatchesLineFilter(bad, 'unattributed')).toBe(true);
    expect(fuelEntryMatchesLineFilter(bad, 'rideshare')).toBe(false);
    expect(fuelEntryMatchesLineFilter(bad, 'rush_delivery')).toBe(false);

    const c = computeFuelLineConservation([bad]);
    expect(c.unattributedCount).toBe(1);
    expect(c.rideshareCount).toBe(0);
    expect(conservationHolds(c)).toBe(true);
  });

  it('UI predicates partition with empty intersection and full union (S2)', () => {
    const entries = [
      { amount: 10, serviceLine: 'rideshare', serviceLineSource: 'vehicle' },
      { amount: 20, serviceLine: 'rush_delivery', serviceLineSource: 'driver' },
      { amount: 30, serviceLine: null, serviceLineSource: 'unattributed' },
      { amount: 40, serviceLine: 'rideshare', serviceLineSource: 'unattributed' },
    ];
    const rideshare = entries.filter((e) => fuelEntryMatchesLineFilter(e, 'rideshare'));
    const delivery = entries.filter((e) => fuelEntryMatchesLineFilter(e, 'rush_delivery'));
    const unattributed = entries.filter((e) => fuelEntryMatchesLineFilter(e, 'unattributed'));
    expect(rideshare.length + delivery.length + unattributed.length).toBe(entries.length);
    expect(rideshare.some((e) => unattributed.includes(e))).toBe(false);
    expect(delivery.some((e) => unattributed.includes(e))).toBe(false);
    expect(rideshare.some((e) => delivery.includes(e))).toBe(false);

    const c = computeFuelLineConservation(entries);
    expect(c.rideshareCount).toBe(rideshare.length);
    expect(c.deliveryCount).toBe(delivery.length);
    expect(c.unattributedCount).toBe(unattributed.length);
    expect(conservationHolds(c)).toBe(true);
  });

  it('conservationHolds fails when allSpend is independent of broken buckets (S1)', () => {
    const broken: FuelLineConservation = {
      allCount: 3,
      rideshareCount: 1,
      deliveryCount: 1,
      unattributedCount: 1,
      allSpend: 300,
      rideshareSpend: 100,
      deliverySpend: 50,
      unattributedSpend: 25,
    };
    expect(conservationHolds(broken)).toBe(false);
  });

  it('conservationHolds fails when bucket counts miss allCount (S1)', () => {
    const broken: FuelLineConservation = {
      allCount: 5,
      rideshareCount: 1,
      deliveryCount: 1,
      unattributedCount: 1,
      allSpend: 175,
      rideshareSpend: 100,
      deliverySpend: 50,
      unattributedSpend: 25,
    };
    expect(conservationHolds(broken)).toBe(false);
  });
});

describe('fuel cards multi-home', () => {
  it('shows dual-line vehicle card in both tabs', () => {
    const card = { assignedVehicleId: 'v1', assignedDriverId: 'd1' };
    const vehicles = [{ id: 'v1', serviceLines: ['rideshare', 'rush_delivery'] }];
    const drivers = [{ id: 'd1', serviceLines: ['rideshare'] }];
    expect(fuelCardMatchesLine(card, 'rideshare', vehicles, drivers)).toBe(true);
    expect(fuelCardMatchesLine(card, 'rush_delivery', vehicles, drivers)).toBe(true);
  });

  it('hides unassigned from line tabs', () => {
    expect(fuelCardMatchesLine({}, 'rideshare', [], [])).toBe(false);
    expect(fuelCardMatchesLine({}, 'all', [], [])).toBe(true);
  });
});

describe('integrity population filter', () => {
  it('includes dual-line vehicle in both lenses', () => {
    const vehicles = [
      { id: 'a', serviceLines: ['rideshare'] },
      { id: 'b', serviceLines: ['rideshare', 'rush_delivery'] },
      { id: 'c', serviceLines: ['rush_delivery'] },
    ];
    expect(integrityVehiclesForLine(vehicles, 'rideshare').map((v) => v.id)).toEqual(['a', 'b']);
    expect(integrityVehiclesForLine(vehicles, 'rush_delivery').map((v) => v.id)).toEqual(['b', 'c']);
  });

  it('flag sets equal across lenses for same vehicle', () => {
    const flags = ['f1', 'f2'];
    expect(integrityFlagSetsEqual(flags, ['f2', 'f1'])).toBe(true);
  });
});

describe('phase 4 allocation flag', () => {
  it('defaults off', () => {
    expect(isFuelServiceLineAllocationEnabled(null)).toBe(false);
    expect(isFuelServiceLineAllocationEnabled({})).toBe(false);
    expect(isFuelServiceLineAllocationEnabled({ fuelServiceLineAllocationEnabled: true })).toBe(true);
  });

  it('builds unallocated honesty', () => {
    expect(buildUnallocatedHonesty({ rideshareSpend: 10, deliverySpend: 5, unattributedSpend: 2 })).toEqual({
      attributedSpend: 15,
      unallocatedSpend: 2,
    });
  });

  it('projects unattributed by trip mix and conserves', () => {
    const p = projectUnattributedSpendByTripMix({
      rideshareSpend: 100,
      deliverySpend: 40,
      unattributedSpend: 20,
      ratio: { rideshare: 0.5, rush_delivery: 0.5 },
    });
    expect(p.conserves).toBe(true);
    expect(p.rideshareAttributed).toBe(100);
    expect(p.deliveryAttributed).toBe(40);
    expect(p.rideshareProjected).toBe(10);
    expect(p.deliveryProjected).toBe(10);
    expect(p.rideshareTotal + p.deliveryTotal).toBe(160);
  });
});

describe('S8 fuel service-line tabs kill switch', () => {
  it('defaults on when unset', async () => {
    const { isFuelServiceLineTabsEnabled } = await import('./fuelServiceLineTabsFlag');
    expect(isFuelServiceLineTabsEnabled(null)).toBe(true);
    expect(isFuelServiceLineTabsEnabled({})).toBe(true);
    expect(isFuelServiceLineTabsEnabled({ fuelServiceLineTabsEnabled: true })).toBe(true);
    expect(isFuelServiceLineTabsEnabled({ fuelServiceLineTabsEnabled: false })).toBe(false);
  });
});
