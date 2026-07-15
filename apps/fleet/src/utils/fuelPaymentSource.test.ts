import { describe, expect, it } from 'vitest';
import {
  normalizeFuelPaymentSourceEnum,
  resolveFuelPaymentSource,
  isCashStyleFuelPaymentSource,
} from './fuelPaymentSource';

describe('fuelPaymentSource', () => {
  it('defaults blank/unknown to RideShare_Cash', () => {
    expect(normalizeFuelPaymentSourceEnum(undefined)).toBe('RideShare_Cash');
    expect(normalizeFuelPaymentSourceEnum('')).toBe('RideShare_Cash');
    expect(normalizeFuelPaymentSourceEnum('???')).toBe('RideShare_Cash');
  });

  it('maps UI metadata keys', () => {
    expect(resolveFuelPaymentSource('rideshare_cash')).toEqual({
      enum: 'RideShare_Cash',
      meta: 'rideshare_cash',
    });
    expect(resolveFuelPaymentSource('company_card')).toEqual({
      enum: 'Gas_Card',
      meta: 'company_card',
    });
    expect(resolveFuelPaymentSource('driver_cash')).toEqual({
      enum: 'Personal',
      meta: 'driver_cash',
    });
  });

  it('treats RideShare/Personal/Petty as cash-style', () => {
    expect(isCashStyleFuelPaymentSource('RideShare_Cash')).toBe(true);
    expect(isCashStyleFuelPaymentSource('Personal')).toBe(true);
    expect(isCashStyleFuelPaymentSource('Gas_Card')).toBe(false);
  });
});
