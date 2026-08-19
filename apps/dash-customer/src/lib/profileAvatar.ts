export const MAX_CUSTOMER_AVATAR_BYTES = 2 * 1024 * 1024;
export const CUSTOMER_AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Fallback when the customer has not uploaded a photo yet. */
export function resolveProfileAvatarUrl(url: string | null | undefined, fallback: string): string {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  return trimmed || fallback;
}

export function assertCustomerAvatarFile(file: File): void {
  if (file.size > MAX_CUSTOMER_AVATAR_BYTES) {
    throw new Error('Photo must be 2MB or smaller');
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    throw new Error('Use a JPEG, PNG, or WebP photo');
  }
}
