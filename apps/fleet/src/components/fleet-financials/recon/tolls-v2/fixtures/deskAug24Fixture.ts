import type { TollV2Charge, TollV2Desk, TollV2Decision } from '../types';

/** Week of 24 Aug 2026 — 5 sure, 4 likely, 2 pick, 1 no trip (smoke-run shape). */
export function deskAug24Fixture(over?: Partial<TollV2Desk>): TollV2Desk {
  const mk = (
    id: string,
    section: string,
    confidence: 'sure' | 'likely' | 'two_trips' | null,
    state = 'pending',
    amount = 27500,
  ): TollV2Charge => ({
    id,
    version: 1,
    section,
    state,
    occurredAt: '2026-08-25T17:02:00-05:00',
    amountMinor: amount,
    openMinor: state === 'pending' ? amount : 0,
    paidBy: 'tag' as const,
    plazaName: 'Portmore East',
    plate: '9042 PX',
    driverName: 'Kenny G. Rattray',
    confidence,
    suggestions:
      section === 'no_trip'
        ? []
        : [
            {
              suggestionId: `sug-${id}`,
              paybackId: `pb-${id}`,
              paybackVersion: 1,
              paidBackMinor: amount,
              top: true,
              confidence,
              trip: {
                requestAt: '2026-08-25T16:50:00-05:00',
                dropoffAt: '2026-08-25T17:10:00-05:00',
                paymentMethod: 'card',
              },
            },
          ],
    decision: null,
  });

  const charges: TollV2Charge[] = [
    ...['a', 'b', 'c', 'd', 'e'].map((x) => mk(`sure-${x}`, 'suggested', 'sure')),
    ...['a', 'b', 'c'].map((x) => mk(`likely-${x}`, 'suggested', 'likely')),
    {
      ...mk('pick-1', 'pick', 'two_trips'),
      suggestions: [
        {
          suggestionId: 'sug-pick-1-a',
          paybackId: 'pb-pick-1-a',
          paybackVersion: 1,
          paidBackMinor: 27500,
          top: true,
          confidence: 'two_trips' as const,
          trip: {
            requestAt: '2026-08-25T11:50:00-05:00',
            dropoffAt: '2026-08-25T12:28:00-05:00',
            paymentMethod: 'cash',
          },
        },
        {
          suggestionId: 'sug-pick-1-b',
          paybackId: 'pb-pick-1-b',
          paybackVersion: 1,
          paidBackMinor: 27500,
          top: false,
          confidence: 'two_trips' as const,
          trip: {
            requestAt: '2026-08-25T12:23:00-05:00',
            dropoffAt: '2026-08-25T13:30:00-05:00',
            paymentMethod: 'card',
          },
        },
      ],
    },
    {
      ...mk('pick-2', 'pick', 'two_trips'),
      suggestions: [
        {
          suggestionId: 'sug-pick-2-a',
          paybackId: 'pb-pick-2-a',
          paybackVersion: 1,
          paidBackMinor: 27500,
          top: true,
          confidence: 'two_trips' as const,
          trip: {
            requestAt: '2026-08-25T14:09:00-05:00',
            dropoffAt: '2026-08-25T14:55:00-05:00',
            paymentMethod: 'card',
          },
        },
        {
          suggestionId: 'sug-pick-2-b',
          paybackId: 'pb-pick-2-b',
          paybackVersion: 1,
          paidBackMinor: 27500,
          top: false,
          confidence: 'two_trips' as const,
          trip: {
            requestAt: '2026-08-25T14:47:00-05:00',
            dropoffAt: '2026-08-25T15:23:00-05:00',
            paymentMethod: 'cash',
          },
        },
      ],
    },
    mk('no-trip-1', 'no_trip', null),
  ];
  charges.push({
    ...mk('dec-1', 'decided', 'sure', 'decided'),
    openMinor: 0,
    decision: {
      kind: 'matched',
      by: 'Deeki T',
      at: '2026-08-26T14:40:00Z',
      trip: {
        requestAt: '2026-08-25T14:42:00-05:00',
        dropoffAt: '2026-08-25T15:12:00-05:00',
        paymentMethod: 'card',
      },
    } as TollV2Decision,
  });
  charges.push({
    id: 'receipt-unv',
    version: 1,
    section: 'receipts',
    state: 'unverified',
    occurredAt: '2026-08-26T10:00:00-05:00',
    amountMinor: 40000,
    openMinor: 40000,
    paidBy: 'cash',
    plazaName: 'Spanish Town East',
    plate: '5179KZ',
    driverName: 'Kenny G. Rattray',
    confidence: null,
    suggestions: [],
    decision: null,
  });

  const still = charges
    .filter((c) => !['decided', 'rejected', 'duplicate', 'unverified'].includes(c.state))
    .reduce((n, c) => n + c.openMinor, 0);
  const platform = 97750;
  const driver = 27500;
  const fleet = 0;
  const spend = platform + driver + fleet + still;

  return {
    weekKey: '2026-08-24',
    sealed: false,
    weekVersion: 3,
    matcherBusy: false,
    result: {
      spend: { totalMinor: spend, tagMinor: spend, cashMinor: 0 },
      bearers: { platformMinor: platform, driverMinor: driver, fleetMinor: fleet },
      tagAccount: { usageMinor: spend, closingMinor: 500000 - spend },
      drivers: [{ driverId: 'd1', owesFleetMinor: 27500, driverName: 'Kenny G. Rattray' }],
    },
    charges,
    paybacks: [],
    kept: [],
    reviewPairs: [],
    blockers: [{ kind: 'charge', id: 'pick-1', amountMinor: 27500 }],
    ...over,
  };
}
