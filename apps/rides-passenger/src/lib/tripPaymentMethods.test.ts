import { describe, expect, it } from 'vitest';
import {
  coerceDigitalPaymentMethodId,
  getDefaultDigitalPaymentMethodId,
  isDigitalTripPaymentMethodId,
} from '@/lib/tripPaymentMethods';

describe('delegated booking payment helpers', () => {
  it('treats cash as non-digital', () => {
    expect(isDigitalTripPaymentMethodId('cash')).toBe(false);
  });

  it('treats card-backed methods as digital', () => {
    expect(isDigitalTripPaymentMethodId('apple_pay')).toBe(true);
    expect(isDigitalTripPaymentMethodId('visa_1212')).toBe(true);
  });

  it('coerces cash to a digital default', () => {
    const digitalId = getDefaultDigitalPaymentMethodId();
    expect(isDigitalTripPaymentMethodId(digitalId)).toBe(true);
    expect(coerceDigitalPaymentMethodId('cash')).toBe(digitalId);
  });

  it('keeps an already-digital selection', () => {
    expect(coerceDigitalPaymentMethodId('apple_pay')).toBe('apple_pay');
  });
});
