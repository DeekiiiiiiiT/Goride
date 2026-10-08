import { Capacitor } from '@capacitor/core';
import { handleFleetAuthCallbackUrl } from './utils/fleetAuthCallback';
import { isFleetAuthCallbackUrl } from './utils/fleetAuthSignup';

async function finishNativeAuthFromUrl(url: string): Promise<void> {
  if (!isFleetAuthCallbackUrl(url)) return;
  const handled = await handleFleetAuthCallbackUrl(url);
  if (!handled) return;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {
    /* OAuth may have completed without Browser plugin */
  }
}

/** Native shell bootstrap (Android). No-op on the website. */
export async function initFleetNative(): Promise<void> {
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
      await StatusBar.setBackgroundColor({ color: '#030213' });
    }

    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (err) {
    console.warn('[fleet-native] init skipped', err);
  }
}
