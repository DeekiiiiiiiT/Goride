import type { TollV2Charge, TollV2Desk, TollV2DisputeResult, TollV2DisputeRow, TollV2PartNo } from '../types';
import { deskAug24Fixture } from './deskAug24Fixture';

/** Week of 9 Nov 2026 in the six-part shape of public.toll_v2_week_desk (S3): every charge has a part, the
 *  disputes block covers the company's active disputes, and blockers carry their part. Figures are made up for
 *  the test and are not Stitch's samples. */
const PART_OF_SECTION: Record<string, TollV2PartNo> = {
  suggested: 1,
  pick: 2,
  no_trip: 4,
  receipts: 5,
  decided: 6,
};

export function disputeRow(over: Partial<TollV2DisputeRow> & { id: string }): TollV2DisputeRow {
  return {
    version: 1,
    state: 'to_send',
    platform: 'uber',
    driverId: 'd1',
    driverName: 'Kenny G. Rattray',
    chargeId: `ch-${over.id}`,
    chargeWeekKey: '2026-11-09',
    occurredAt: '2026-11-09T07:15:00-05:00',
    plazaName: 'Portmore',
    plate: '5179KZ',
    tollMinor: 39000,
    paidMinor: 37000,
    owedMinor: 2000,
    recoveredMinor: 0,
    leftMinor: 2000,
    trip: { pickupAt: '2026-11-09T06:55:00-05:00', dropoffAt: '2026-11-09T07:40:00-05:00' },
    windowDays: 9,
    daysLeft: 8,
    windowClosed: false,
    red: false,
    late: false,
    heldBySweep: false,
    canMarkSent: true,
    canRefundReceived: false,
    canLost: false,
    bearerIfNotSent: { bearer: 'driver', amountMinor: 2000 },
    fromWeekKey: null,
    refundCandidates: [],
    ...over,
  };
}

export function deskPartsFixture(over?: Partial<TollV2Desk>): TollV2Desk {
  const base = deskAug24Fixture();
  const charges: TollV2Charge[] = base.charges.map((c) => ({ ...c, part: PART_OF_SECTION[c.section] }));
  charges.push({
    id: 'indrive-1',
    version: 4,
    section: 'suggested',
    state: 'pending',
    part: 1,
    occurredAt: '2026-11-13T17:40:00-05:00',
    amountMinor: 28000,
    openMinor: 28000,
    paidBy: 'tag',
    plazaName: 'Spanish Town Bypass',
    plate: '5179KZ',
    driverName: 'Kenny G. Rattray',
    confidence: 'sure',
    suggestions: [
      {
        suggestionId: 'sug-indrive-1',
        kind: 'rider_pays_driver',
        reasonKey: 'rider_owed_driver_collects',
        top: true,
        confidence: 'sure',
        paybackId: null as unknown as string,
        paybackVersion: null as unknown as number,
        paidBackMinor: null as unknown as number,
        trip: { requestAt: '2026-11-13T17:12:00-05:00', dropoffAt: '2026-11-13T18:05:00-05:00', paymentMethod: 'cash' },
      },
    ],
    decision: null,
  });

  const active: TollV2DisputeRow[] = [
    disputeRow({ id: 'dsp-send' }),
    disputeRow({ id: 'dsp-red', daysLeft: 1, red: true, late: true, occurredAt: '2026-11-10T12:55:00-05:00', plazaName: 'Spanish Town' }),
    disputeRow({
      id: 'dsp-closed',
      daysLeft: 0,
      windowClosed: true,
      red: true,
      late: true,
      canMarkSent: false,
    }),
    disputeRow({
      id: 'dsp-sent',
      version: 3,
      state: 'sent',
      canMarkSent: false,
      canRefundReceived: true,
      canLost: true,
      fromWeekKey: '2026-11-02',
      chargeWeekKey: '2026-11-02',
      refundCandidates: [
        { paybackId: 'pb-adj', version: 7, kind: 'adjustment', paidOn: '2026-11-17', openMinor: 2000, inRefundWindow: true, suggestionId: 'sug-r', suggested: true },
        { paybackId: 'pb-line', version: 2, kind: 'trip_line', paidOn: '2026-11-10', openMinor: 1500, inRefundWindow: false },
      ],
    }),
  ];
  const results: TollV2DisputeResult[] = [
    {
      ...disputeRow({ id: 'res-won', state: 'won', canMarkSent: false }),
      outcome: 'won',
      recoveredMinor: 2000,
      borneMinor: 0,
      bearer: null,
      decider: { by: 'Roam', at: '2026-11-17T09:00:00Z' },
      undo: { decision_id: 'dec-won' },
    },
    {
      ...disputeRow({ id: 'res-lost', state: 'lost', canMarkSent: false }),
      outcome: 'lost',
      recoveredMinor: 0,
      borneMinor: 2000,
      bearer: 'fleet',
      undo: null,
    },
  ];

  return {
    ...base,
    weekKey: '2026-11-09',
    charges,
    blockers: [
      { kind: 'charge', id: 'sure-a', amountMinor: 27500, reason: 'pending', part: 1 },
      { kind: 'charge', id: 'pick-1', amountMinor: 27500, reason: 'pending', part: 2 },
      { kind: 'charge', id: 'pick-2', amountMinor: 27500, reason: 'pending', part: 2 },
      { kind: 'charge', id: 'no-trip-1', amountMinor: 27500, reason: 'pending', part: 4 },
      { kind: 'charge', id: 'receipt-unv', amountMinor: 40000, reason: 'unverified', part: 5 },
    ],
    parts: [
      { part: 1, key: 'matches', count: 1, amountMinor: 0, status: 'todo' },
      { part: 2, key: 'pick_trip', count: 2, amountMinor: 0, status: 'todo' },
      { part: 3, key: 'disputes', count: 3, amountMinor: 6000, status: 'todo' },
      { part: 4, key: 'no_trip', count: 1, amountMinor: 0, status: 'todo' },
      { part: 5, key: 'other_checks', count: 1, amountMinor: 0, status: 'todo' },
      { part: 6, key: 'seal', count: 5, amountMinor: 0, status: 'blocked' },
    ],
    disputes: {
      active,
      tiles: {
        toSend: { count: 3, amountMinor: 6000 },
        sent: { count: 1, amountMinor: 2000 },
        late: { count: 2, amountMinor: 4000 },
      },
      waitingMinor: 8000,
    },
    results,
    sumLine: {
      spendMinor: 541000,
      paidBackMinor: 517000,
      driverMinor: 0,
      fleetMinor: 0,
      waitingOnUberMinor: 24000,
      stillOpenMinor: 0,
    },
    earlierResults: { refundedMinor: 0, toDriverMinor: 0, toFleetMinor: 0 },
    approvals: { soleManager: true, thresholdMinor: 500000 },
    ...over,
  };
}
