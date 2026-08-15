import { Capacitor } from '@capacitor/core';
import { handleDashCustomerAuthCallbackUrl } from '@/lib/dashCustomerAuthCallback';
import { isDashCustomerAuthCallbackUrl } from '@/lib/dashCustomerAuth';

async function finishNativeAuthFromUrl(url: string): Promise<void> {
  if (!isDashCustomerAuthCallbackUrl(url)) return;
  const handled = await handleDashCustomerAuthCallbackUrl(url);
  if (!handled) return;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {
    /* OAuth may have completed without Browser plugin */
  }
}

/** Native shell bootstrap (Android/iOS). No-op on web. */
export async function initRushNative(): Promise<void> {
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
      await StatusBar.setBackgroundColor({ color: '#006d43' });
    }

    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (err) {
    console.warn('[rush-native] init skipped', err);
  }
}

export function isRushNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
