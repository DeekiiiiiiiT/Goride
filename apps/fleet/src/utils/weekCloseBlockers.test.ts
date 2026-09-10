import { describe, expect, it } from 'vitest';
import { isCashResidualOnlyBlockers } from './weekCloseBlockers';

describe('isCashResidualOnlyBlockers', () => {
  it('true when only Collect/Pay codes remain', () => {
    expect(
      isCashResidualOnlyBlockers([
        { code: 'SETTLEMENT_DRIVER_OWES', severity: 'block' },
        { code: 'SETTLEMENT_FLEET_OWES', severity: 'block' },
      ]),
    ).toBe(true);
  });

  it('false when a toll mismatch remains', () => {
    expect(
      isCashResidualOnlyBlockers([
        { code: 'SETTLEMENT_DRIVER_OWES', severity: 'block' },
        { code: 'TOLL_SPEND_MISMATCH', severity: 'block' },
      ]),
    ).toBe(false);
  });

  it('ignores warn-only week blockers', () => {
    expect(
      isCashResidualOnlyBlockers(
        [{ code: 'SETTLEMENT_DRIVER_OWES', severity: 'block' }],
        [{ code: 'BUSINESS_WEEK_PNL_UNAVAILABLE', severity: 'warn' }],
      ),
    ).toBe(true);
  });

  it('false when empty', () => {
    expect(isCashResidualOnlyBlockers([])).toBe(false);
  });
});
