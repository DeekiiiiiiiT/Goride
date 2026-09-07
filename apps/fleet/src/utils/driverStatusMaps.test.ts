/**
 * Exhaustive status maps must include Awaiting Tolls (R4-1 / Flawless R5–R6).
 * Imports the real component maps — not a local tautology.
 */
import { describe, expect, it } from 'vitest';
import type { PayoutStatus } from '../types/driverPayoutPeriod';
import type { SettlementStatus } from '../components/drivers/SettlementSummaryView';
import { payoutStatusConfig } from '../components/drivers/payoutStatusConfig';
import { settlementStatusConfig } from '../components/drivers/settlementStatusConfig';

const ALL_PAYOUT: PayoutStatus[] = [
  'Finalized',
  'Awaiting Cash',
  'Awaiting Tolls',
  'Pending',
];

const ALL_SETTLEMENT: SettlementStatus[] = [
  'Settled',
  'Company Owes',
  'Driver Owes',
  'Awaiting Tolls',
  'Pending',
  'No Activity',
];

describe('driver payout/settlement status SSOT', () => {
  it('payoutStatusConfig covers every PayoutStatus including Awaiting Tolls', () => {
    expect(Object.keys(payoutStatusConfig).sort()).toEqual([...ALL_PAYOUT].sort());
    expect(payoutStatusConfig['Awaiting Tolls']).toBeDefined();
  });

  it('settlementStatusConfig covers every SettlementStatus including Awaiting Tolls', () => {
    expect(Object.keys(settlementStatusConfig).sort()).toEqual([...ALL_SETTLEMENT].sort());
    expect(settlementStatusConfig['Awaiting Tolls']).toBeDefined();
  });
});
