// Fleet Inventory completion audit — helper tests (IV-02, IV-04, IV-05, IV-08).
import { describe, expect, it } from 'vitest';
import { aggregateKitVehicles, chainCheckLine, kitColumns, neededCells, storeNeedLabel, storeNeedsFrom } from './inventoryData';

const line = (vehicle: string, kitLineId: string, label: string, status: string, extra: Record<string, unknown> = {}) => ({
  vehicle_id: vehicle,
  license_plate: vehicle,
  kit_line_id: kitLineId,
  item_id: kitLineId.startsWith('tag') ? null : `item-${kitLineId}`,
  line_type: kitLineId.startsWith('tag') ? 'linked_toll_tag' : 'item',
  line_label: label,
  line_status: status,
  required: true,
  qty_required: 1,
  sort_order: Number(kitLineId.replace(/\D/g, '')) || 0,
  ...extra,
});

describe('kit grid (IV-04, IV-08)', () => {
  const rows = [
    line('5179KZ', 'l1', 'Car Jack', 'ok'),
    line('5179KZ', 'l2', 'Tyre pump', 'missing'),
    line('5179KZ', 'l3', 'Fire extinguisher', 'missing', { required: false }),
    line('5179KZ', 'tag4', 'Toll tag', 'ok'),
    line('1505LM', 'l1', 'Car Jack', 'missing'),
    line('1505LM', 'l2', 'Tyre pump', 'missing'),
    line('1505LM', 'l3', 'Fire extinguisher', 'missing', { required: false }),
    line('1505LM', 'tag4', 'Toll tag', 'missing'),
  ];

  it('builds columns from the kit lines in sort order', () => {
    expect(kitColumns(rows).map((c) => c.label)).toEqual(['Car Jack', 'Tyre pump', 'Fire extinguisher', 'Toll tag']);
  });

  it('never counts optional lines as missing', () => {
    const cars = aggregateKitVehicles(rows);
    const a = cars.find((c) => c.vehicleId === '5179KZ')!;
    expect(a.requiredLines).toBe(3);
    expect(a.missingLines).toBe(1);
    expect(a.missingLabels).toEqual(['Tyre pump']);
    expect(a.pct).toBe(67);
  });

  it('treats the old "linked" status as ok', () => {
    const cars = aggregateKitVehicles([line('X', 'tag1', 'Toll tag', 'linked')]);
    expect(cars[0].okLines).toBe(1);
  });

  it('lists only required, not-ok lines as needed (item lines only when asked)', () => {
    const cars = aggregateKitVehicles(rows);
    expect(neededCells(cars).length).toBe(4);
    expect(neededCells(cars, true).map((c) => c.label).sort()).toEqual(['Car Jack', 'Tyre pump', 'Tyre pump']);
  });
});

describe('low or out (IV-02)', () => {
  it('reads store needs and labels them', () => {
    const needs = storeNeedsFrom({
      storeNeeds: [{ item_id: 'p', name: 'Tyre pump', store_on_hand: 0, needed: 2, need_status: 'out' }],
    });
    expect(needs[0].status).toBe('out');
    expect(storeNeedLabel(needs[0])).toBe('Tyre pump — out (2 needed)');
  });
});

describe('nightly check line (IV-05)', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  it('prints the real time in Jamaica time', () => {
    const r = chainCheckLine('2026-11-09T06:30:00Z', true, 'America/Jamaica', now);
    expect(r.stale).toBe(false);
    expect(r.text).toBe('Nightly check ran 1:30 AM today · all stock numbers add up');
  });
  it('goes stale after 26 hours and names the date', () => {
    const r = chainCheckLine('2026-11-07T06:30:00Z', true, 'America/Jamaica', now);
    expect(r.stale).toBe(true);
    expect(r.text).toContain("Nightly check hasn't run since");
    expect(r.text).toContain('7 Nov 2026');
  });
});
