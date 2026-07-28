import { describe, expect, it } from 'vitest';
import { buildCashCollectionTx, buildDriverPayoutTx } from './driverSettlementTx';

describe('buildCashCollectionTx', () => {
  it('builds Payment_Received Completed for Cash', () => {
    const tx = buildCashCollectionTx(
      {
        amount: 500,
        date: '2026-07-28',
        paymentMethod: 'Cash',
        transactionType: 'payment',
        workPeriodStart: '2026-07-20T12:00:00.000Z',
        workPeriodEnd: '2026-07-26T12:00:00.000Z',
        notes: 'Test',
      },
      { driverId: 'd1', driverName: 'Kenny' },
    );
    expect(tx.type).toBe('Payment_Received');
    expect(tx.category).toBe('Cash Collection');
    expect(tx.status).toBe('Completed');
    expect(tx.amount).toBe(500);
    expect(tx.metadata?.workPeriodStart).toBe('2026-07-20');
  });

  it('builds Pending for Bank Transfer payment', () => {
    const tx = buildCashCollectionTx(
      {
        amount: 100,
        date: '2026-07-28',
        paymentMethod: 'Bank Transfer',
        transactionType: 'payment',
        workPeriodStart: '2026-07-20',
        workPeriodEnd: '2026-07-26',
      },
      { driverId: 'd1', driverName: 'Kenny' },
    );
    expect(tx.status).toBe('Pending');
    expect(tx.isReconciled).toBe(false);
  });

  it('never uses Payout type for collections', () => {
    const tx = buildCashCollectionTx(
      {
        amount: 50,
        date: '2026-07-28',
        paymentMethod: 'Cash',
        transactionType: 'payment',
        workPeriodStart: '2026-07-20',
        workPeriodEnd: '2026-07-26',
      },
      { driverId: 'd1', driverName: 'Kenny' },
    );
    expect(tx.type).not.toBe('Payout');
    expect(tx.category).not.toBe('Driver Payouts');
  });
});

describe('buildDriverPayoutTx', () => {
  it('builds Payout Completed for Cash', () => {
    const tx = buildDriverPayoutTx(
      {
        amount: 1043.65,
        date: '2026-07-28',
        paymentMethod: 'Cash',
        workPeriodStart: '2026-07-20',
        workPeriodEnd: '2026-07-26',
      },
      { driverId: 'd1', driverName: 'Kenny' },
    );
    expect(tx.type).toBe('Payout');
    expect(tx.category).toBe('Driver Payouts');
    expect(tx.status).toBe('Completed');
  });

  it('does not build Cash Collection', () => {
    const tx = buildDriverPayoutTx(
      {
        amount: 10,
        date: '2026-07-28',
        paymentMethod: 'Cash',
        workPeriodStart: '2026-07-20',
        workPeriodEnd: '2026-07-26',
      },
      { driverId: 'd1', driverName: 'Kenny' },
    );
    expect(tx.type).not.toBe('Payment_Received');
    expect(tx.category).not.toBe('Cash Collection');
  });
});
