import { describe, expect, it } from 'vitest';
import {
  TOLL_WEEK_RESULT_CONTRACT_VERSION,
  type TollWeekResultV1,
} from './weekResultV1.ts';

describe('TollWeekResultV1 contract', () => {
  it('sample satisfies the type and spend identity', () => {
    const sample: TollWeekResultV1 = {
      contractVersion: TOLL_WEEK_RESULT_CONTRACT_VERSION,
      companyId: '00000000-0000-4000-8000-000000000001',
      weekKey: '2026-03-09',
      state: 'open',
      weekVersion: 0,
      factsHash: 'abc',
      engineVersion: 'phase0',
      spend: { tagMinor: 700, cashMinor: 300, totalMinor: 1000 },
      bearers: { platformMinor: 400, driverMinor: 200, fleetMinor: 400 },
      pending: { charges: 1, amountMinor: 100 },
      unverified: { charges: 0, amountMinor: 0 },
      awaitingCash: { charges: 0, amountMinor: 0 },
      paybacks: {
        receivedMinor: 1000,
        allocatedMinor: 800,
        unallocatedMinor: 200,
        leftUnlinkedMinor: 0,
        takenBackMinor: 0,
      },
      carriedIn: [],
      tagAccount: {
        openingMinor: 5000,
        topUpsMinor: 1000,
        usageMinor: 1000,
        closingMinor: 5000,
      },
      drivers: [
        {
          driverId: 'driver-1',
          owesFleetMinor: 0,
          fleetOwesMinor: 300,
          recoveredInPassengerCashMinor: 0,
          spendMinor: 1000,
          tagSpendMinor: 700,
          cashSpendMinor: 300,
          platformMinor: 400,
          fleetMinor: 200,
        },
      ],
      afterSeal: [],
      ledgerMovements: { bankMinor: 0 },
    };

    expect(sample.contractVersion).toBe(1);
    expect(sample.spend.totalMinor).toBe(
      sample.spend.tagMinor + sample.spend.cashMinor,
    );
  });
});
