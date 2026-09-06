/**
 * R-1 regression: business command errors must not count as "endpoint absent".
 */
import { describe, expect, it } from 'vitest';
import {
  SettlementCommandApiError,
  isSettlementCommandUnavailable,
} from './settlementCommandsApi';

describe('isSettlementCommandUnavailable', () => {
  it('treats 404 and 501 as unavailable (cutover)', () => {
    expect(isSettlementCommandUnavailable(new SettlementCommandApiError('gone', 404))).toBe(true);
    expect(isSettlementCommandUnavailable(new SettlementCommandApiError('nyi', 501))).toBe(true);
  });

  it('does NOT treat business 4xx as unavailable (R-1)', () => {
    expect(isSettlementCommandUnavailable(new SettlementCommandApiError('STALE_RESIDUAL', 409, 'STALE_RESIDUAL'))).toBe(
      false,
    );
    expect(isSettlementCommandUnavailable(new SettlementCommandApiError('Forbidden', 403))).toBe(false);
    expect(isSettlementCommandUnavailable(new SettlementCommandApiError('PAY_CAP_EXCEEDED', 400))).toBe(false);
  });

  it('treats network TypeError as unavailable', () => {
    expect(isSettlementCommandUnavailable(new TypeError('Failed to fetch'))).toBe(true);
  });
});
