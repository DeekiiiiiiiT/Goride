import { describe, expect, it } from 'vitest';
import { classifyFuelLogEdit, findAwaitingCashTxForFillGroup } from './fuelLogEditGate';
import { fuelSaveErrorMessage } from './fuelSaveErrorMessage';
import { validateGasCardCreateGates } from './gasCardCreateGates';
import { isAdminKnownFillCashMeta, stampAdminKnownFillCashMeta } from './adminKnownFillStamp';
import type { FuelEntry } from '../types/fuel';
import type { FinancialTransaction } from '../types/data';

describe('classifyFuelLogEdit', () => {
  it('routes awaiting cash split to resolve', () => {
    const cash = {
      id: 'c1',
      paymentSource: 'Personal',
      metadata: {
        fillGroupId: 'fg-1',
        splitRole: 'cash',
        awaitingCashStatement: true,
        splitVolumeOwner: true,
      },
    } as FuelEntry;
    const card = {
      id: 'g1',
      paymentSource: 'Gas_Card',
      amount: 0,
      metadata: {
        fillGroupId: 'fg-1',
        splitRole: 'card',
        awaitingCardStatement: true,
        splitVolumeOwner: false,
      },
    } as FuelEntry;
    expect(classifyFuelLogEdit(card, [cash, card])).toEqual({
      kind: 'resolve_split_cash',
      fillGroupId: 'fg-1',
    });
  });

  it('blocks money edit on awaiting card anchor', () => {
    const entry = {
      id: 'a1',
      paymentSource: 'Gas_Card',
      amount: 0,
      entryMode: 'Anchor',
      metadata: { awaitingCardStatement: true },
    } as FuelEntry;
    const gate = classifyFuelLogEdit(entry);
    expect(gate.kind).toBe('awaiting_card_readonly');
  });

  it('allows normal edit otherwise', () => {
    const entry = {
      id: 'x1',
      paymentSource: 'Personal',
      amount: 1000,
      metadata: {},
    } as FuelEntry;
    expect(classifyFuelLogEdit(entry).kind).toBe('edit');
  });
});

describe('findAwaitingCashTxForFillGroup', () => {
  it('finds awaiting cash tx by fillGroupId', () => {
    const txs = [
      {
        id: 't1',
        status: 'Pending',
        category: 'Fuel',
        metadata: { fillGroupId: 'fg-1', splitRole: 'cash', awaitingCashStatement: true },
      },
    ] as FinancialTransaction[];
    expect(findAwaitingCashTxForFillGroup(txs, 'fg-1')?.id).toBe('t1');
  });
});

describe('fuelSaveErrorMessage', () => {
  it('maps UNLINKED_SPLIT_HALVES', () => {
    const err = Object.assign(new Error('server said no'), { code: 'UNLINKED_SPLIT_HALVES' });
    expect(fuelSaveErrorMessage(err)).toContain('Gas Card + Cash');
  });
});

describe('validateGasCardCreateGates', () => {
  it('requires station and photo', () => {
    expect(
      validateGasCardCreateGates({
        assignedGasCard: { id: 'c1' },
        gasCardLookupDone: true,
        matchedStationId: '',
        odometer: 100,
        hasOdometerPhoto: true,
      }).ok,
    ).toBe(false);
    expect(
      validateGasCardCreateGates({
        assignedGasCard: { id: 'c1' },
        gasCardLookupDone: true,
        matchedStationId: 'st-1',
        odometer: 100,
        hasOdometerPhoto: true,
      }),
    ).toEqual({ ok: true });
  });
});

describe('adminKnownFillStamp', () => {
  it('stamps and detects bypass review', () => {
    const meta = stampAdminKnownFillCashMeta({ paymentSource: 'driver_cash' }, 'user-1');
    expect(meta.adminBypassReview).toBe(true);
    expect(meta.adminKnownFillBy).toBe('user-1');
    expect(isAdminKnownFillCashMeta(meta)).toBe(true);
  });
});
