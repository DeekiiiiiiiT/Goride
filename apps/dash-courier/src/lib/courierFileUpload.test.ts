import { describe, expect, it } from 'vitest';
import { normalizeStoragePath } from './normalizeStoragePath';

describe('normalizeStoragePath', () => {
  it('returns path unchanged when not http', () => {
    expect(normalizeStoragePath('user-id/proofs/abc.jpg')).toBe('user-id/proofs/abc.jpg');
  });

  it('extracts path from signed URL when possible', () => {
    const url =
      'https://example.supabase.co/storage/v1/object/sign/courier-documents/user/proofs/x.jpg?token=abc';
    expect(normalizeStoragePath(url)).toBe('user/proofs/x.jpg');
  });
});
