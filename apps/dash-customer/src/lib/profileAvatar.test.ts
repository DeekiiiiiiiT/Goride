import { describe, expect, it } from 'vitest';
import { assertCustomerAvatarFile, MAX_CUSTOMER_AVATAR_BYTES, resolveProfileAvatarUrl } from './profileAvatar';

describe('resolveProfileAvatarUrl', () => {
  it('keeps a real photo URL', () => {
    expect(resolveProfileAvatarUrl('https://cdn.example/me.jpg', 'fallback')).toBe('https://cdn.example/me.jpg');
  });

  it('falls back when empty', () => {
    expect(resolveProfileAvatarUrl('  ', 'fallback')).toBe('fallback');
    expect(resolveProfileAvatarUrl(null, 'fallback')).toBe('fallback');
  });
});

describe('assertCustomerAvatarFile', () => {
  it('rejects oversized photos', () => {
    const file = new File([new Uint8Array(MAX_CUSTOMER_AVATAR_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' });
    expect(() => assertCustomerAvatarFile(file)).toThrow(/2MB/);
  });

  it('rejects disallowed types', () => {
    const file = new File([new Uint8Array(8)], 'x.gif', { type: 'image/gif' });
    expect(() => assertCustomerAvatarFile(file)).toThrow(/JPEG/);
  });

  it('allows jpeg under the size cap', () => {
    const file = new File([new Uint8Array(32)], 'me.jpg', { type: 'image/jpeg' });
    expect(() => assertCustomerAvatarFile(file)).not.toThrow();
  });
});
