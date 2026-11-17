import { describe, expect, it } from 'vitest';
import { isFuelFinalizeTransportFailure } from './fuelFinalizeTransport';

describe('isFuelFinalizeTransportFailure', () => {
  it('546 and 5xx', () => {
    expect(isFuelFinalizeTransportFailure({ status: 546 })).toBe(true);
    expect(isFuelFinalizeTransportFailure({ status: 409 })).toBe(false);
  });

  it('fetch failures', () => {
    expect(isFuelFinalizeTransportFailure(new TypeError('Failed to fetch'))).toBe(true);
  });
});