import { isNativeCapacitorPlatform } from '@roam/types';
import { DASH_CUSTOMER_PRODUCTION_ORIGIN } from './dashCustomerAuth';
import { toast } from './toast';

/** Public store link a friend can open in the Rush app or on the web. */
export function storeShareUrl(merchantId: string, origin?: string): string {
  const base = (
    isNativeCapacitorPlatform()
      ? DASH_CUSTOMER_PRODUCTION_ORIGIN
      : origin ??
        (typeof window !== 'undefined' ? window.location.origin : DASH_CUSTOMER_PRODUCTION_ORIGIN)
  ).replace(/\/$/, '');
  return `${base}/?merchant=${encodeURIComponent(merchantId.trim())}`;
}

export async function shareStoreLink(name: string, merchantId: string): Promise<void> {
  const url = storeShareUrl(merchantId);
  const title = name;
  const text = `Order from ${name} on Roam Rush`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    toast.success('Store link copied');
  } catch {
    toast.error('Could not share this store');
  }
}
