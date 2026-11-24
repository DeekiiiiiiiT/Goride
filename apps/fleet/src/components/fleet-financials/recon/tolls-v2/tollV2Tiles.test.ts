import { describe, expect, it } from 'vitest';
import { deskAug24Fixture } from './fixtures/deskAug24Fixture';
import { computeTiles } from './tollV2Tiles';
import type { TollV2Charge } from './types';

describe('computeTiles', () => {
  it('tiles add up when an unverified receipt is excluded from still to decide', () => {
    const desk = deskAug24Fixture();
    const tiles = computeTiles(desk.result, desk.charges);
    expect(tiles.tilesAddUp).toBe(true);
    expect(desk.charges.some((c) => c.state === 'unverified')).toBe(true);
  });

  it('excludes unverified openMinor from still to decide', () => {
    const unverified: TollV2Charge = {
      id: 'u1',
      version: 1,
      section: 'receipts',
      state: 'unverified',
      amountMinor: 40000,
      openMinor: 40000,
      paidBy: 'cash',
    };
    const desk = deskAug24Fixture();
    const withExtra = [...desk.charges, unverified];
    const tiles = computeTiles(desk.result, withExtra);
    expect(tiles.stillToDecideMinor).toBe(
      computeTiles(desk.result, desk.charges).stillToDecideMinor,
    );
    expect(tiles.tilesAddUp).toBe(true);
  });

  it("carries earlier weeks' dispute results for the Driver pays / Fleet pays tiles without breaking the add-up", () => {
    const desk = deskAug24Fixture();
    const plain = computeTiles(desk.result, desk.charges);
    const tiles = computeTiles(desk.result, desk.charges, { toDriverMinor: 12000, toFleetMinor: 500 });
    expect(tiles.earlierDriverMinor).toBe(12000);
    expect(tiles.earlierFleetMinor).toBe(500);
    expect(tiles.driverMinor).toBe(plain.driverMinor);
    expect(tiles.tilesAddUp).toBe(true);
  });
});
