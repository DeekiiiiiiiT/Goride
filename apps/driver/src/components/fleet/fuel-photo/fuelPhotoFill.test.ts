import { describe, expect, it } from 'vitest';
import {
  buildFuelPhotoQueueAction,
  canLeaveOdometerStep,
  canSave,
  fillChipForServerFill,
  newFuelPhotoDraft,
  pricePerLitre,
  stationQuestion,
  distanceLabel,
  type FuelPhotoDraft,
} from './fuelPhotoFill';

// Made-up ids; numbers from a real 5179KZ cash fill (J$4,000.00 · 18.70 L · 200,412 km).
const CAPTURE = '0b8f6d2a-3c41-4e7a-9a11-5d2c7e9f0a01';
const AT = new Date(2026, 10, 25, 7, 3, 40).getTime(); // 25 Nov 2026, 7:03:40 local
const ctx = { driverId: 'zz-driver-1', driverName: 'Test Driver', vehicleId: '5179KZ', vehiclePlate: '5179KZ' };

function draft(extra: Partial<FuelPhotoDraft> = {}): FuelPhotoDraft {
  return { ...newFuelPhotoDraft(CAPTURE, AT), hasOdometerPhoto: true, ...extra };
}

describe('Gas Card + Cash in the new flow', () => {
  it('needs the pump total and litres (the cash part comes from the statement)', () => {
    expect(canSave(draft({ payment: 'gas_card_and_cash', hasPumpPhoto: true }))).toBe(false);
    expect(canSave(draft({ payment: 'gas_card_and_cash', hasPumpPhoto: true, total: 6000, liters: 28.05 }))).toBe(true);
  });

  it('builds one split item: cash half J$0 waiting for the statement, card half anchored', () => {
    const action = buildFuelPhotoQueueAction(
      draft({ payment: 'gas_card_and_cash', hasPumpPhoto: true, total: 6000, liters: 28.05, splitCardEntryId: 'card-half-1' }),
      ctx,
    );
    expect(action.type).toBe('SUBMIT_SPLIT_FUEL_FILL');
    const p = action.payload as any;
    expect(p.fillGroupId).toBe(CAPTURE);
    expect(p.cashTransaction.amount).toBe(0);
    expect(p.cashTransaction.metadata).toMatchObject({ splitRole: 'cash', splitPumpTotal: 6000, awaitingCashStatement: true, fuelVolume: 28.05, captureId: CAPTURE });
    expect(p.cardFuelEntry).toMatchObject({ id: 'card-half-1', paymentSource: 'Gas_Card', entryMode: 'Anchor' });
    expect(p.cardFuelEntry.metadata).toMatchObject({ splitRole: 'card', fillGroupId: CAPTURE });
    expect(p.receiptBlobKey).toBe(`fuel-photo-pump-${CAPTURE}`);
  });
});

describe('Where did you fuel? (screen 12)', () => {
  // Flat-earth metres for the test: 0.001° ≈ 111 m.
  const dist = (aLat: number, aLng: number, bLat: number, bLng: number) => Math.hypot(aLat - bLat, aLng - bLng) * 111_000;
  const fix = { lat: 18, lng: -77, accuracy: 8, timestamp: '', fixAt: '' };
  const stations = [
    { id: 'blaize', name: 'Blaize Old Harbour Road', location: { lat: 18.0009, lng: -77 } },
    { id: 'rubis', name: 'RUBIS Old Harbour Road', location: { lat: 18.0036, lng: -77 } },
    { id: 'total', name: 'TotalEnergies, Old Hope Road', location: { lat: 18.011, lng: -77 } },
    { id: 'far', name: 'Far away', location: { lat: 18.2, lng: -77 } },
    { id: 'new', name: 'Not verified', status: 'learnt', location: { lat: 18.0001, lng: -77 } },
  ];

  it('no fix = no question', () => {
    expect(stationQuestion(undefined, stations, dist)).toEqual({ inside: null, options: [] });
  });

  it('inside a station = that station, no question', () => {
    const r = stationQuestion({ ...fix, lat: 18.0009 }, stations, dist);
    expect(r.inside?.id).toBe('blaize');
    expect(r.options).toEqual([]);
  });

  it('outside = nearest three verified within 5 km', () => {
    const r = stationQuestion(fix, stations, dist);
    expect(r.inside).toBeNull();
    expect(r.options.map((o) => o.id)).toEqual(['blaize', 'rubis', 'total']);
    expect(distanceLabel(r.options[0].distanceM)).toBe('0.1 km away');
  });

  it('the tapped station goes on the fill', () => {
    const tx = (buildFuelPhotoQueueAction(
      draft({ payment: 'rideshare_cash', hasPumpPhoto: true, stationClaim: { stationId: 'blaize', stationName: 'Blaize Old Harbour Road' } }),
      ctx,
    ).payload as any).transaction;
    expect(tx.metadata.driverClaim).toMatchObject({ stationId: 'blaize', leftStation: true });
  });
});

describe('list chips', () => {
  it('server photo-read state → chip; old fills get none', () => {
    expect(fillChipForServerFill('waiting')).toBe('sent');
    expect(fillChipForServerFill('read')).toBe('read');
    expect(fillChipForServerFill('needs_look')).toBe('needs_look');
    expect(fillChipForServerFill(undefined)).toBeNull();
  });
});

describe('steps', () => {
  it('Next on the odometer needs only the photo', () => {
    expect(canLeaveOdometerStep(newFuelPhotoDraft(CAPTURE, AT))).toBe(false);
    expect(canLeaveOdometerStep(draft())).toBe(true);
  });

  it('Cash needs the pump photo; Gas Card saves straight away', () => {
    expect(canSave(draft({ payment: 'rideshare_cash' }))).toBe(false);
    expect(canSave(draft({ payment: 'rideshare_cash', hasPumpPhoto: true }))).toBe(true);
    expect(canSave(draft({ payment: 'gas_card' }))).toBe(true);
    expect(canSave(draft())).toBe(false);
  });

  it('price per litre only with both numbers', () => {
    expect(pricePerLitre(4000, 18.7)).toBe(213.9);
    expect(pricePerLitre(4000, undefined)).toBeUndefined();
  });
});

describe('Save → one waiting item (FO-05)', () => {
  it('cash fill with no numbers: no amount, photos attached, server reads them', () => {
    const action = buildFuelPhotoQueueAction(draft({ payment: 'rideshare_cash', hasPumpPhoto: true }), ctx);
    expect(action.type).toBe('SUBMIT_FUEL_EXPENSE');
    const p = action.payload as any;
    expect(p.transaction.id).toBe(CAPTURE);
    expect('amount' in p.transaction).toBe(false);
    expect(p.transaction.metadata.captureId).toBe(CAPTURE);
    expect(p.transaction.date).toBe('2026-11-25');
    expect(p.transaction.time).toBe('07:03:40');
    expect(p.odometerBlobKey).toBe(`fuel-photo-odo-${CAPTURE}`);
    expect(p.receiptBlobKey).toBe(`fuel-photo-pump-${CAPTURE}`);
  });

  it('cash fill with numbers: negative J$ amount, litres and price', () => {
    const action = buildFuelPhotoQueueAction(
      draft({ payment: 'rideshare_cash', hasPumpPhoto: true, total: 4000, liters: 18.7, totalSource: 'photo', odometerKm: 200412, odometerSource: 'photo' }),
      ctx,
    );
    const tx = (action.payload as any).transaction;
    expect(tx.amount).toBe(-4000);
    expect(tx.odometer).toBe(200412);
    expect(tx.metadata.fuelVolume).toBe(18.7);
    expect(tx.metadata.pricePerLiter).toBe(213.9);
    expect(tx.metadata.odometerMethod).toBe('ai_verified');
    expect(tx.metadata.needsLogReview).toBeUndefined();
  });

  it('a typed odometer goes to review like today', () => {
    const tx = (buildFuelPhotoQueueAction(draft({ payment: 'rideshare_cash', hasPumpPhoto: true, odometerKm: 200412, odometerSource: 'typed' }), ctx).payload as any).transaction;
    expect(tx.metadata.odometerMethod).toBe('manual_override');
    expect(tx.metadata.needsLogReview).toBe(true);
  });

  it('Gas Card without a known card: sent without one, the server attaches it (FO-12)', () => {
    const action = buildFuelPhotoQueueAction(draft({ payment: 'gas_card', odometerKm: 200412 }), ctx);
    expect(action.type).toBe('SUBMIT_GAS_CARD_ANCHOR');
    const e = (action.payload as any).fuelEntry;
    expect('cardId' in e).toBe(false);
    expect(e.paymentSource).toBe('Gas_Card');
    expect(e.metadata.captureId).toBe(CAPTURE);
    expect(buildFuelPhotoQueueAction(draft({ payment: 'gas_card' }), { ...ctx, cardId: 'card-1' }).payload).toMatchObject({ fuelEntry: { cardId: 'card-1' } });
  });

  it('GPS age is measured against the photo', () => {
    const fixAt = new Date(AT - 35_000).toISOString();
    const tx = (buildFuelPhotoQueueAction(
      draft({ payment: 'rideshare_cash', hasPumpPhoto: true, location: { lat: 18, lng: -77, accuracy: 8, timestamp: fixAt, fixAt, ageS: 0 } }),
      ctx,
    ).payload as any).transaction;
    expect(tx.metadata.locationMetadata.ageS).toBe(35);
  });

  it('no location: says why, never blocks', () => {
    const tx = (buildFuelPhotoQueueAction(draft({ payment: 'rideshare_cash', hasPumpPhoto: true, locationMissingReason: 'Location off' }), ctx).payload as any).transaction;
    expect(tx.metadata.locationMetadata).toBeUndefined();
    expect(tx.metadata.locationMissingReason).toBe('Location off');
  });
});
