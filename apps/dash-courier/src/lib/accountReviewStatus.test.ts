import { describe, expect, it } from 'vitest';
import { buildAccountReviewItems, mapComplianceStatus } from './accountReviewStatus';
import type { CourierDocumentRow } from './courierDocumentService';

function doc(
  partial: Pick<CourierDocumentRow, 'doc_type' | 'status'> & Partial<CourierDocumentRow>,
): CourierDocumentRow {
  return {
    id: partial.id || partial.doc_type,
    user_id: 'u1',
    file_url: partial.file_url ?? 'https://example.com/file.jpg',
    expiry_date: null,
    ...partial,
  };
}

describe('mapComplianceStatus', () => {
  it('maps backend compliance values to review labels', () => {
    expect(mapComplianceStatus(null)).toBe('not-submitted');
    expect(mapComplianceStatus('pending')).toBe('submitted');
    expect(mapComplianceStatus('approved')).toBe('verified');
    expect(mapComplianceStatus('rejected')).toBe('rejected');
    expect(mapComplianceStatus('expired')).toBe('expired');
  });
});

describe('buildAccountReviewItems', () => {
  it('uses real docs, background check, and vehicle on file', () => {
    const items = buildAccountReviewItems({
      docs: [
        doc({ doc_type: 'drivers_license', status: 'approved' }),
        doc({ doc_type: 'insurance', status: 'pending' }),
      ],
      backgroundCheckStatus: 'pending',
      hasVehicle: true,
    });
    expect(items.map((row) => [row.id, row.status, row.statusLabel])).toEqual([
      ['license', 'verified', 'Verified'],
      ['insurance', 'submitted', 'Submitted'],
      ['vehicle', 'submitted', 'Submitted'],
      ['background', 'submitted', 'Submitted'],
    ]);
  });

  it('marks missing docs and vehicle as not submitted', () => {
    const items = buildAccountReviewItems({
      docs: [],
      backgroundCheckStatus: null,
      hasVehicle: false,
    });
    expect(items.every((row) => row.status === 'not-submitted')).toBe(true);
  });
});
