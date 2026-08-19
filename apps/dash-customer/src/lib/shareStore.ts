import { toast } from '@/lib/toast';

export async function shareStoreLink(name: string, merchantId: string): Promise<void> {
  const url = `${window.location.origin}${window.location.pathname}?merchant=${encodeURIComponent(merchantId)}`;
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
