import { describe, expect, it } from 'vitest';
import {
  fuelPaymentPartitionKind,
  isGasCardFuelEntry,
  isOutOfPocketFuelEntry,
  resolveFuelPaymentSource,
} from './fuelPaymentSource.ts';

describe('F-6 payment partition', () => {
  it('company_card meta-only is gas card', () => {
    const e = { type: 'Manual_Entry', metadata: { paymentSource: 'company_card' } };
    expect(isGasCardFuelEntry(e)).toBe(true);
    expect(isOutOfPocketFuelEntry(e)).toBe(false);
    expect(fuelPaymentPartitionKind(e)).toBe('gas_card');
  });

  it('Cash + Card_Transaction is out of pocket (not silent gas card)', () => {
    const e = { type: 'Card_Transaction', paymentSource: 'Cash' };
    expect(resolveFuelPaymentSource('Cash').enum).toBe('Personal');
    expect(isGasCardFuelEntry(e)).toBe(false);
    expect(isOutOfPocketFuelEntry(e)).toBe(true);
    expect(fuelPaymentPartitionKind(e)).toBe('out_of_pocket');
  });

  it('Gas_Card Card_Transaction is gas card', () => {
    const e = { type: 'Card_Transaction', paymentSource: 'Gas_Card' };
    expect(fuelPaymentPartitionKind(e)).toBe('gas_card');
  });
});
