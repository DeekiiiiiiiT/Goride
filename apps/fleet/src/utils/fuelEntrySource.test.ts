import { describe, expect, it } from 'vitest';
import {
  resolveAuthorshipFromTransaction,
  resolveFuelEntrySource,
} from './fuelEntrySource';
import type { FuelEntry } from '../types/fuel';

const base = (overrides: Partial<FuelEntry> & Record<string, unknown> = {}): FuelEntry =>
  ({
    id: 'e1',
    date: '2026-07-20',
    type: 'Reimbursement',
    amount: 1500,
    liters: 6.86,
    odometer: 170773,
    location: 'TotalEnergies',
    vehicleId: 'v1',
    driverId: 'd1',
    ...overrides,
  }) as FuelEntry;

describe('resolveFuelEntrySource', () => {
  it('trusts explicit entrySource over isManual cash flag', () => {
    expect(
      resolveFuelEntrySource(
        base({
          entrySource: 'driver-portal',
          metadata: { isManual: true, portal_type: 'Manual_Entry' },
        }),
      ),
    ).toBe('driver-portal');
  });

  it('does not label approved reimbursement as Admin Entry from isManual alone', () => {
    expect(
      resolveFuelEntrySource(
        base({
          type: 'Reimbursement',
          source: 'Manual Approval',
          metadata: {
            isManual: true,
            portal_type: 'Manual_Entry',
            source: 'Manual Approval',
          },
        }),
      ),
    ).toBe('driver-portal');
  });

  it('labels admin SubmitExpense (source Manual) as admin-manual', () => {
    expect(
      resolveFuelEntrySource(
        base({
          type: 'Fuel_Manual_Entry',
          metadata: { source: 'Manual', isManual: true, portal_type: 'Manual_Entry' },
        }),
      ),
    ).toBe('admin-manual');
  });

  it('labels admin Fuel Log modal create as admin-manual', () => {
    expect(
      resolveFuelEntrySource(
        base({
          type: 'Fuel_Manual_Entry',
          metadata: { source: 'Fuel Log', isManual: true, portal_type: 'Manual_Entry' },
        }),
      ),
    ).toBe('admin-manual');
  });

  it('labels driver portal Manual_Entry as portal even when isManual is set', () => {
    expect(
      resolveFuelEntrySource(
        base({
          type: 'Manual_Entry',
          source: 'Driver Portal',
          metadata: { isManual: true },
        }),
      ),
    ).toBe('driver-portal');
  });

  it('labels admin edit when isEdited is set on portal entry', () => {
    expect(
      resolveFuelEntrySource(
        base({
          type: 'Manual_Entry',
          source: 'Driver Portal',
          metadata: { isEdited: true },
        }),
      ),
    ).toBe('admin-edit');
  });
});

describe('resolveAuthorshipFromTransaction', () => {
  it('defaults driver expenses to driver-portal', () => {
    expect(
      resolveAuthorshipFromTransaction({
        type: 'Expense',
        metadata: { paymentMethod: 'RideShare Cash' },
      }),
    ).toBe('driver-portal');
  });

  it('preserves admin-manual from SubmitExpense', () => {
    expect(
      resolveAuthorshipFromTransaction({
        type: 'Fuel_Manual_Entry',
        metadata: { entrySource: 'admin-manual', source: 'Manual' },
      }),
    ).toBe('admin-manual');
  });
});
