import { describe, expect, it } from 'vitest';
import { receiptNumberLabel } from './TollV2CheckReceiptDialog';

describe('receiptNumberLabel', () => {
  it('shows the printed number when it is stored', () => {
    expect(receiptNumberLabel({ receipt_number: 'R-1001', sourceRef: 'receipt:plz-a:drv-1:R-1001' })).toBe('R-1001');
  });

  it('takes the number from an older receipt reference, never the reference itself', () => {
    const label = receiptNumberLabel({ sourceRef: 'receipt:plz-portmore-east:d1f01000-0000-4000-8000-000000000001:R-1001' });
    expect(label).toBe('R-1001');
    expect(label).not.toContain('plz-');
  });

  it('shows a dash when the receipt had no number', () => {
    expect(receiptNumberLabel({ sourceRef: 'submission:sub-9' })).toBe('—');
    expect(receiptNumberLabel({})).toBe('—');
  });
});
