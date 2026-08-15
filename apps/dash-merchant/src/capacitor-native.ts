import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { handlePartnerAuthCallbackUrl } from '@/lib/partnerAuthCallback';
import { clearPartnerOAuthIntent, isPartnerAuthCallbackUrl } from '@/lib/partnerAuth';

async function closeAuthBrowser(): Promise<void> {
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {
    /* OAuth may have completed without Browser plugin */
  }
}

async function finishNativeAuthFromUrl(url: string): Promise<void> {
  if (!isPartnerAuthCallbackUrl(url)) return;
  const result = await handlePartnerAuthCallbackUrl(url);
  if (!result.ok) {
    clearPartnerOAuthIntent();
    toast.error(result.error ?? 'Sign-in failed. Please try again.');
    await closeAuthBrowser();
    return;
  }
  await closeAuthBrowser();
}

/** Native shell bootstrap (Android/iOS). No-op on web. */
export async function initPartnerNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { App } = await import('@capacitor/app');

    const launch = await App.getLaunchUrl();
    if (launch?.url) {
      await finishNativeAuthFromUrl(launch.url);
    }

    await App.addListener('appUrlOpen', ({ url }) => {
      void finishNativeAuthFromUrl(url);
    });

    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#10b981' });
    }

    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (err) {
    console.warn('[partner-native] init skipped', err);
  }
}

export function isPartnerNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
