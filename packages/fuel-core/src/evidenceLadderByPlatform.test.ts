import { describe, expect, it } from 'vitest';
import { buildEvidenceLadder } from './evidenceLadder.ts';
import { foldMeasuredGaps } from './shiftLegs.ts';

describe('evidence ladder: online km by platform (owner 23 Nov)', () => {
  const trips = [
    { platform: 'Uber', onTripKm: 100, enrouteKm: 20, openKm: 10, unavailableKm: 0 },
    { platform: 'uber', onTripKm: 100, enrouteKm: 10, openKm: 0, unavailableKm: 0 },
    { platform: 'InDrive', onTripKm: 50, positioningMissing: true },
    { platform: 'Roam', onTripKm: 10, positioningMissing: true },
  ];

  it('Uber = on-trip + its positioning; InDrive/Roam = on-trip × (1 + Uber ratio); parts add to online km', () => {
    const ladder = buildEvidenceLadder({ spanKm: 10_000, trips });
    const online = ladder.sources.find((s) => s.category === 'online')!;
    // Uber ratio = 40 / 200 = 0.2
    expect(online.byPlatform).toEqual({ Uber: 240, InDrive: 60, Roam: 12 });
    const sum = Object.values(online.byPlatform!).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(online.km, 1);
  });

  it('commute and pickups by platform ride along, scaled like their totals', () => {
    const ladder = buildEvidenceLadder({
      spanKm: 10_000,
      trips,
      commuteKm: 30,
      commuteByPlatform: { Uber: 20, InDrive: 10 },
      repositionKm: 50,
      repositionByPlatform: { Uber: 40, Roam: 10 },
    });
    expect(ladder.sources.find((s) => s.category === 'commute')!.byPlatform).toEqual({ Uber: 20, InDrive: 10 });
    expect(ladder.sources.find((s) => s.category === 'reposition')!.byPlatform).toEqual({ Uber: 40, Roam: 10 });
  });

  it('pickup gaps go to the platform of the trip they lead to', () => {
    const folded = foldMeasuredGaps([
      { routedKm: 5, straightKm: null, alreadyCountedKm: 1, platform: 'uber' },
      { routedKm: null, straightKm: 3, alreadyCountedKm: 0, platform: 'InDrive' },
      { routedKm: null, straightKm: null, alreadyCountedKm: 0, platform: 'Roam' },
    ]);
    expect(folded.repositionKm).toBe(7);
    expect(folded.byPlatform).toEqual({ Uber: 4, InDrive: 3 });
  });

  it('scaled down with online km when the claims exceed the odometer span', () => {
    const ladder = buildEvidenceLadder({ spanKm: 156, trips });
    const online = ladder.sources.find((s) => s.category === 'online')!;
    expect(online.km).toBeCloseTo(156, 1);
    expect(online.byPlatform!.Uber).toBeCloseTo(120, 1);
    const sum = Object.values(online.byPlatform!).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(online.km, 1);
  });
});
