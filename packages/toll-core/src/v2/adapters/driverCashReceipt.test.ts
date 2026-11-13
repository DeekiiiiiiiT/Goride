import { describe, expect, it } from 'vitest';
import { driverCashReceipt } from './driverCashReceipt.ts';

describe('driverCashReceipt', () => {
  const base = {
    submissionId: 'sub-1',
    receiptNumber: 'RCP-99',
    receiptUrl: 'https://example.com/r.jpg',
    occurredAt: '2024-06-10T12:00:00-05:00',
    amountMinor: 37000,
    plazaId: 'plaza-main',
    vehicleId: 'vehicle-a',
    driverId: 'driver-a',
    plaza: 'Main',
    lane: '2',
    collector: 'JAA',
    vehicleClass: 'Class 1',
  };

  it('emits one unverified row with evidence', () => {
    const out = driverCashReceipt(base);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].source_ref).toBe('receipt:plaza-main:RCP-99');
    expect(out.rows[0].evidence_status).toBe('unverified');
    expect(out.rows[0].evidence.receipt_url).toBe(base.receiptUrl);
  });

  it('requires receipt URL', () => {
    const out = driverCashReceipt({ ...base, receiptUrl: '' });
    expect(out.rows).toHaveLength(0);
    expect(out.problems[0].reason).toContain('Receipt URL');
  });

  it('is deterministic', () => {
    expect(driverCashReceipt(base)).toEqual(driverCashReceipt(base));
  });

  it('scopes receipt numbers to plaza', () => {
    const a = driverCashReceipt({ ...base, plazaId: 'plaza-a', receiptNumber: '100' });
    const b = driverCashReceipt({ ...base, plazaId: 'plaza-b', receiptNumber: '100' });
    expect(a.rows[0].source_ref).toBe('receipt:plaza-a:100');
    expect(b.rows[0].source_ref).toBe('receipt:plaza-b:100');
    expect(a.rows[0].source_ref).not.toBe(b.rows[0].source_ref);
  });

  it('unknown plaza with same receipt number uses submission id', () => {
    const a = driverCashReceipt({
      ...base,
      submissionId: 'sub-a',
      plazaId: 'unknown',
      receiptNumber: '123',
    });
    const b = driverCashReceipt({
      ...base,
      submissionId: 'sub-b',
      plazaId: 'unknown',
      receiptNumber: '123',
    });
    expect(a.rows[0].source_ref).toBe('submission:sub-a');
    expect(b.rows[0].source_ref).toBe('submission:sub-b');
    expect(a.rows[0].source_ref).not.toBe(b.rows[0].source_ref);
  });
});
