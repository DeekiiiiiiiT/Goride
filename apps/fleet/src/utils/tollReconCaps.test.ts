import { describe, expect, it } from 'vitest';
import { TOLL_RECON_CAPS, tollReconTruncationMessage } from './tollReconCaps';

describe('tollReconCaps', () => {
  it('exposes centralized limits', () => {
    expect(TOLL_RECON_CAPS.reconciledLimit).toBe(1000);
    expect(TOLL_RECON_CAPS.unreconciledPageSize).toBe(250);
    expect(TOLL_RECON_CAPS.maxFetchPages).toBe(40);
  });

  it('builds truncation message only when flags set', () => {
    expect(tollReconTruncationMessage({})).toBeNull();
    expect(tollReconTruncationMessage({ reconciledCapped: true })).toMatch(/reconciled history/);
  });
});
