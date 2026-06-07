import { Capacitor } from '@capacitor/core';

export type ShareContent = {
  title: string;
  message: string;
  url?: string;
};

/** Opens the system share sheet on native; Web Share API in the browser. */
export async function openSystemShareSheet(content: ShareContent): Promise<boolean> {
  const body = content.url ? `${content.message}\n${content.url}` : content.message;

  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    try {
      await Share.share({
        title: content.title,
        text: body,
        url: content.url,
        dialogTitle: content.title,
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|abort|dismiss|closed/i.test(msg)) return true;
      throw e;
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: content.title,
        text: body,
        url: content.url,
      });
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return true;
      throw e;
    }
  }

  return false;
}
