import { describe, expect, it } from 'vitest';
import {
  computeDeleteAfter,
  EVIDENCE_RETENTION_DAYS,
  isPendingParentStatus,
  parseStoragePathFromUrl,
} from '../supabase/functions/server/evidence_storage.ts';

describe('evidence_storage', () => {
  it('computeDeleteAfter adds 14 days', () => {
    const resolved = new Date('2026-01-01T12:00:00.000Z');
    expect(computeDeleteAfter(resolved)).toBe('2026-01-15T12:00:00.000Z');
    expect(EVIDENCE_RETENTION_DAYS).toBe(14);
  });

  it('isPendingParentStatus treats pending and review as hold', () => {
    expect(isPendingParentStatus('Pending')).toBe(true);
    expect(isPendingParentStatus('needs review')).toBe(true);
    expect(isPendingParentStatus('Approved')).toBe(false);
  });

  it('parseStoragePathFromUrl handles signed and path URLs', () => {
    const signed =
      'https://x.supabase.co/storage/v1/object/sign/ephemeral-evidence/org1/fuel_receipt/a.jpg?token=abc';
    expect(parseStoragePathFromUrl(signed)).toEqual({
      bucket: 'ephemeral-evidence',
      path: 'org1/fuel_receipt/a.jpg',
    });

    const legacy =
      'https://x.supabase.co/storage/v1/object/sign/make-37f42386-docs/driver-docs/uuid.jpg?token=abc';
    expect(parseStoragePathFromUrl(legacy)?.path).toBe('driver-docs/uuid.jpg');
  });
});
