import { describe, expect, it } from 'vitest';
import {
  collectSettlementSignDrift,
  computePeriodSettlement,
  computePeriodSettlementMinor,
} from './driverPeriodSettlement.ts';
import { fromMoneyMinor, toMoneyMinor } from './money.ts';

describe('computePeriodSettlementMinor (A-3)', () => {
  it('matches major wrapper for representative week', () => {
    const input = {
      driverShare: 25000,
      fuelDeduction: 1200,
      baseCashOwed: 8000,
      baseCashPaid: 3500,
      tollCashWash: 500,
      tollPersonal: 200,
      fuelCredits: 100,
      cashWrittenOff: 50,
      settlementPaid: 5000,
      tipsPaidToDriver: 300,
    };
    const major = computePeriodSettlement(input);
    const minor = computePeriodSettlementMinor(input);
    expect(fromMoneyMinor(minor.netPayoutMinor)).toBe(major.netPayout);
    expect(fromMoneyMinor(minor.settlementMinor)).toBe(major.settlement);
    expect(fromMoneyMinor(minor.grossSettlementMinor)).toBe(major.grossSettlement);
    expect(fromMoneyMinor(minor.overpaidAmountMinor)).toBe(major.overpaidAmount);
  });

  it('handles negative gross settlement continuously', () => {
    const input = {
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 2000,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      settlementPaid: 5000,
    };
    const m = computePeriodSettlementMinor(input);
    expect(m.settlementMinor).toBe(toMoneyMinor(-7000));
    expect(m.overpaidAmountMinor).toBe(toMoneyMinor(5000));
  });

  it('openingCashCustody increases adjCashBalance (Phase 2 carry-forward)', () => {
    const base = {
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 100,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
    };
    const without = computePeriodSettlementMinor(base);
    const withCustody = computePeriodSettlementMinor({ ...base, openingCashCustody: 50 });
    expect(fromMoneyMinor(withCustody.adjCashBalanceMinor)).toBe(
      fromMoneyMinor(without.adjCashBalanceMinor) + 50,
    );
  });
});

describe('signed pass-through (C-7)', () => {
  it('negative tollPersonal (refund/fleet-owes) flows through to cash owed', () => {
    const base = {
      driverShare: 10000,
      fuelDeduction: 0,
      baseCashOwed: 5000,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
    };
    const neutral = computePeriodSettlementMinor(base);
    const refunded = computePeriodSettlementMinor({ ...base, tollPersonal: -300 });
    // A $300 toll refund must REDUCE cash owed by exactly $300 (not clamp to 0).
    expect(refunded.tollChargedToDriverMinor).toBe(toMoneyMinor(-300));
    expect(neutral.cashOwedMinor - refunded.cashOwedMinor).toBe(toMoneyMinor(300));
    // Lower cash owed → lower adjusted balance → higher gross settlement to driver.
    expect(refunded.grossSettlementMinor).toBe(
      (neutral.grossSettlementMinor + toMoneyMinor(300)) as typeof neutral.grossSettlementMinor,
    );
  });

  it('negative fuelCredits / settlementPaid are no longer clamped to zero', () => {
    const m = computePeriodSettlementMinor({
      driverShare: 0,
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: 0,
      tollPersonal: 0,
      fuelCredits: -150,
      settlementPaid: -50,
    });
    // fuelCredits subtracts, so a negative credit ADDS back to adjusted balance.
    expect(fromMoneyMinor(m.adjCashBalanceMinor)).toBe(150);
    expect(fromMoneyMinor(m.settlementPaidMinor)).toBe(-50);
  });

  it('collectSettlementSignDrift lists only the negative previously-clamped fields', () => {
    const drift = collectSettlementSignDrift({
      driverShare: -999, // NOT a clamped field → ignored
      fuelDeduction: 0,
      baseCashOwed: 0,
      baseCashPaid: 0,
      tollCashWash: -1,
      tollPersonal: -2,
      fuelCredits: 3,
      cashWrittenOff: -4,
      settlementPaid: 0,
      tipsPaidToDriver: -5,
    });
    expect(drift.sort()).toEqual(
      ['cashWrittenOff', 'tipsPaidToDriver', 'tollCashWash', 'tollPersonal'].sort(),
    );
  });
});
