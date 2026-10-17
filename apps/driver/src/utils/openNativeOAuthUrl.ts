import { Capacitor } from '@capacitor/core';

/**
 * Open Supabase OAuth URL outside the Capacitor WebView.
 * Android: system browser (Custom Tabs DNS failed Play review for accounts.google.com).
 * iOS: SFSafariViewController via @capacitor/browser.
 */
export async function openNativeOAuthUrl(url: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.location.assign(url);
    return;
  }

  if (Capacitor.getPlatform() === 'android') {
    const { App } = await import('@capacitor/app');
    await App.openUrl({ url });
    return;
  }

  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

/** Google OAuth button is hidden on Android Play builds — email/password is the review path. */
export function shouldShowNativeGoogleAuth(): boolean {
  if (!Capacitor.isNativePlatform()) return true;
  return Capacitor.getPlatform() !== 'android';
}
