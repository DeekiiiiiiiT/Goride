/**
 * Opens an external URL in the system browser or native maps app.
 * Never throws — navigation failures must not break ride flows.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      try {
        const { App } = await import('@capacitor/app');
        await App.openUrl({ url });
        return;
      } catch {
        /* fall through to window.open */
      }
    }
  } catch {
    /* fall through to window.open */
  }

  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
}
