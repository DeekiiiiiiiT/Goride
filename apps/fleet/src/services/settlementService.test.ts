import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FuelEntry, FuelScenario, WeeklyFuelReport } from '../types/fuel';
import type { Vehicle } from '../types/vehicle';

const mocks = vi.hoisted(() => ({
  getVehicles: vi.fn(),
  getDrivers: vi.fn(),
  getTransactions: vi.fn(),
  saveTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  fetchWithRetry: vi.fn(),
  requireAuthHeaders: vi.fn(),
}));

vi.mock('./api', () => ({
  api: {
    getVehicles: mocks.getVehicles,
    getDrivers: mocks.getDrivers,
    getTransactions: mocks.getTransactions,
    saveTransaction: mocks.saveTransaction,
    deleteTransaction: mocks.deleteTransaction,
  },
  fetchWithRetry: mocks.fetchWithRetry,
}));

vi.mock('../utils/authHeaders', () => ({
  requireAuthHeaders: (...args: unknown[]) => mocks.requireAuthHeaders(...args),
}));

import { enterpriseFuelSyncIdempotencyKey, settlementService } from './settlementService';

const vehicle = { id: 'v1', licensePlate: '5179KZ', currentDriverId: 'd1' } as Vehicle;

const scenario: FuelScenario = {
  id: 'sc1',
  name: 'Standard',
  isDefault: true,
  rules: [
    {
      id: 'r1',
      category: 'Fuel',
      coverageType: 'Percentage',
      coverageValue: 0,
      rideShareCoverage: 50,
      companyUsageCoverage: 100,
      deadheadCoverage: 50,
      personalCoverage: 0,
      miscCoverage: 50,
    },
  ],
  versions: [
    {
      id: 'vsc',
      effectiveFrom: '2000-01-03',
      rules: [
        {
          id: 'r1',
          category: 'Fuel',
          coverageType: 'Percentage',
          coverageValue: 0,
          rideShareCoverage: 50,
          companyUsageCoverage: 100,
          deadheadCoverage: 50,
          personalCoverage: 0,
          miscCoverage: 50,
        },
      ],
      driverIds: ['d1'],
      createdAt: 'x',
    },
  ],
};

const report: WeeklyFuelReport = {
  id: 'd1_2026-08-10',
  weekStart: '2026-08-10',
  weekEnd: '2026-08-16',
  vehicleId: 'v1',
  driverId: 'd1',
  totalGasCardCost: 100,
  totalTripDistance: 0,
  rideShareCost: 50,
  companyMiscDistance: 0,
  companyUsageCost: 0,
  personalDistance: 0,
  personalUsageCost: 0,
  deadheadDistance: 0,
  deadheadCost: 0,
  miscellaneousCost: 50,
  companyShare: 50,
  driverShare: 50,
  status: 'Draft',
};

function gasEntry(partial: Partial<FuelEntry> = {}): FuelEntry {
  return {
    id: 'e-gas',
    date: '2026-08-11',
    amount: 100,
    vehicleId: 'v1',
    driverId: 'd1',
    type: 'Card_Transaction',
    entryMode: 'Anchor',
    paymentSource: 'Gas_Card',
    reconciliationStatus: 'Pending',
    location: 'Shell',
    ...partial,
  } as FuelEntry;
}

const preloaded = {
  vehicles: [vehicle],
  drivers: [{ id: 'd1', name: 'Driver' }],
  scenarios: [scenario],
};

describe('enterpriseFuelSyncIdempotencyKey', () => {
  it('is deterministic per report/entry/kind', () => {
    expect(enterpriseFuelSyncIdempotencyKey('r1', 'e1', 'deduction')).toBe(
      'enterprise_fuel_sync:r1:e1:deduction:v1',
    );
    expect(enterpriseFuelSyncIdempotencyKey('r1', 'e1', 'credit')).not.toBe(
      enterpriseFuelSyncIdempotencyKey('r1', 'e1', 'deduction'),
    );
  });
});

describe('commitWeeklyStatement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTransactions.mockResolvedValue([]);
    mocks.saveTransaction.mockImplementation(async (tx: any) => ({ ...tx, id: tx.id || 'tx-new' }));
    mocks.deleteTransaction.mockResolvedValue(undefined);
    mocks.fetchWithRetry.mockResolvedValue({ ok: true });
    mocks.requireAuthHeaders.mockResolvedValue({});
  });

  it('posts a gas-card driver-share deduction and skips a cash credit', async () => {
    await settlementService.commitWeeklyStatement(report, [gasEntry()], preloaded);
    expect(mocks.saveTransaction).toHaveBeenCalledTimes(1);
    const saved = mocks.saveTransaction.mock.calls[0][0];
    expect(saved.category).toBe('Fuel Deduction');
    expect(saved.amount).toBeLessThan(0);
    expect(saved.metadata.idempotencyKey).toBe(
      enterpriseFuelSyncIdempotencyKey(report.id, 'e-gas', 'deduction'),
    );
  });

  it('posts cash reimbursement plus deduction', async () => {
    await settlementService.commitWeeklyStatement(
      report,
      [
        gasEntry({
          id: 'e-cash',
          type: 'Reimbursement',
          paymentSource: 'RideShare_Cash',
        }),
      ],
      preloaded,
    );
    const categories = mocks.saveTransaction.mock.calls.map((c) => c[0].category);
    expect(categories).toContain('Fuel Reimbursement');
    expect(categories).toContain('Fuel Deduction');
  });

  it('skips insert when an idempotency key already exists', async () => {
    const key = enterpriseFuelSyncIdempotencyKey(report.id, 'e-gas', 'deduction');
    mocks.getTransactions.mockResolvedValue([
      { id: 'existing', metadata: { idempotencyKey: key } },
    ]);
    await settlementService.commitWeeklyStatement(report, [gasEntry()], preloaded);
    expect(mocks.saveTransaction).not.toHaveBeenCalled();
  });

  it('skips already-verified entries', async () => {
    await settlementService.commitWeeklyStatement(
      report,
      [gasEntry({ reconciliationStatus: 'Verified' })],
      preloaded,
    );
    expect(mocks.saveTransaction).not.toHaveBeenCalled();
  });

  it('deletes created txs if the entry Verified write fails', async () => {
    mocks.fetchWithRetry.mockRejectedValue(new Error('entry write failed'));
    await expect(
      settlementService.commitWeeklyStatement(report, [gasEntry()], preloaded),
    ).rejects.toThrow('entry write failed');
    expect(mocks.deleteTransaction).toHaveBeenCalled();
  });
});
