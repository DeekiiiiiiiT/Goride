import { Capacitor } from '@capacitor/core';
import { handleDriverAuthCallbackUrl } from './utils/driverAuthCallback';
import { isDriverAuthCallbackUrl } from './utils/driverAuthRedirect';

async function finishNativeAuthFromUrl(url: string): Promise<void> {
  if (!isDriverAuthCallbackUrl(url)) return;
  const handled = await handleDriverAuthCallbackUrl(url);
  if (!handled) return;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {
    /* OAuth may have completed in WebView */
  }
}

/** Native shell bootstrap (Android/iOS). No-op on web. */
export async function initCapacitorNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

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
}
