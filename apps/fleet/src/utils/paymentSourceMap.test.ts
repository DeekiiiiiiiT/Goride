import { describe, expect, it } from 'vitest';

/** Payment source round-trip — mirrors FuelLogModal maps (A8). */
const PAYMENT_SOURCE_MAP: Record<string, string> = {
  driver_cash: 'Personal',
  rideshare_cash: 'RideShare_Cash',
  company_card: 'Gas_Card',
  petty_cash: 'Petty_Cash',
};

const PAYMENT_SOURCE_TO_DROPDOWN: Record<string, string> = {
  driver_cash: 'driver_cash',
  rideshare_cash: 'rideshare_cash',
  company_card: 'company_card',
  petty_cash: 'petty_cash',
  Personal: 'driver_cash',
  RideShare_Cash: 'rideshare_cash',
  Gas_Card: 'company_card',
  Petty_Cash: 'petty_cash',
  Cash: 'driver_cash',
  'RideShare Cash': 'rideshare_cash',
  'Gas Card': 'company_card',
  Other: 'petty_cash',
};

describe('PAYMENT_SOURCE_MAP round-trip', () => {
  it('maps dropdown keys to stored enums and back', () => {
    for (const key of Object.keys(PAYMENT_SOURCE_MAP)) {
      const stored = PAYMENT_SOURCE_MAP[key];
      expect(PAYMENT_SOURCE_TO_DROPDOWN[stored]).toBe(key);
    }
  });
});
