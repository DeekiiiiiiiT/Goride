import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  getFuelEntry: vi.fn(),
  saveFuelEntry: vi.fn(),
}));

vi.mock('./api', () => ({
  api: {
    saveTransaction: mocks.saveTransaction,
    deleteTransaction: mocks.deleteTransaction,
  },
}));

vi.mock('./fuelService', () => ({
  fuelService: {
    getFuelEntry: mocks.getFuelEntry,
    saveFuelEntry: mocks.saveFuelEntry,
  },
}));

import { purgeFuelExpense, saveFuelExpense } from './fuelExpenseMutationService';

describe('fuelExpenseMutationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('purgeFuelExpense forwards cascade and returns server ids', async () => {
    mocks.deleteTransaction.mockResolvedValue({
      success: true,
      deletedTransactionIds: ['exp-1', 'fuel-credit-exp-1'],
      deletedFuelEntryId: 'fe-1',
      cascaded: true,
    });
    const result = await purgeFuelExpense({ id: 'exp-1' }, { cascade: true });
    expect(mocks.deleteTransaction).toHaveBeenCalledWith('exp-1', { cascade: true });
    expect(result.deletedFuelEntryId).toBe('fe-1');
    expect(result.deletedTransactionIds).toEqual(['exp-1', 'fuel-credit-exp-1']);
  });

  it('saveFuelExpense removes fuel-credit when paymentSource leaves driver_cash', async () => {
    mocks.saveTransaction.mockResolvedValue({
      id: 'exp-1',
      status: 'Approved',
      category: 'Fuel',
      amount: 40,
      date: '2026-09-01',
      metadata: { paymentSource: 'gas_card' },
    });
    mocks.deleteTransaction.mockResolvedValue({ success: true });

    const result = await saveFuelExpense(
      { id: 'exp-1', metadata: { paymentSource: 'gas_card' } },
      {
        previous: {
          id: 'exp-1',
          status: 'Approved',
          category: 'Fuel',
          amount: 40,
          date: '2026-09-01',
          metadata: { paymentSource: 'driver_cash' },
        } as any,
        fuelEntries: [],
      },
    );

    expect(mocks.deleteTransaction).toHaveBeenCalledWith('fuel-credit-exp-1', { cascade: false });
    expect(result.removedFuelCreditId).toBe('fuel-credit-exp-1');
  });

  it('saveFuelExpense syncs linked fuel entry amount', async () => {
    mocks.saveTransaction.mockResolvedValue({
      id: 'exp-1',
      status: 'Approved',
      category: 'Fuel',
      amount: 55,
      date: '2026-09-01',
      vendor: 'Shell',
      quantity: 10,
      metadata: { sourceId: 'fe-1' },
    });
    mocks.saveFuelEntry.mockImplementation(async (e: any) => e);

    const result = await saveFuelExpense(
      { id: 'exp-1' },
      {
        previous: {
          id: 'exp-1',
          status: 'Approved',
          category: 'Fuel',
          amount: 40,
          date: '2026-09-01',
        } as any,
        fuelEntries: [
          {
            id: 'fe-1',
            transactionId: 'exp-1',
            amount: 40,
            date: '2026-09-01T12:00:00',
            liters: 8,
          } as any,
        ],
      },
    );

    expect(mocks.saveFuelEntry).toHaveBeenCalled();
    expect(result.syncedFuelEntryId).toBe('fe-1');
    expect(mocks.saveFuelEntry.mock.calls[0][0].amount).toBe(55);
  });
});
