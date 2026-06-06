import { Capacitor } from '@capacitor/core';
import { handlePassengerAuthCallbackUrl } from './utils/passengerAuthCallback';
import { isPassengerAuthCallbackUrl } from './utils/passengerAuthRedirect';
import { navigateFromAppUrl } from './utils/nativeNavigation';

async function handleIncomingAppUrl(url: string): Promise<void> {
  if (navigateFromAppUrl(url)) return;

  if (!isPassengerAuthCallbackUrl(url)) return;
  const handled = await handlePassengerAuthCallbackUrl(url);
  if (!handled) return;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {
    /* ignore */
  }
}

export async function initCapacitorNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { App } = await import('@capacitor/app');

  const launch = await App.getLaunchUrl();
  if (launch?.url) {
    await handleIncomingAppUrl(launch.url);
  }

  await App.addListener('appUrlOpen', ({ url }) => {
    void handleIncomingAppUrl(url);
  });

  const { StatusBar, Style } = await import('@capacitor/status-bar');
  await StatusBar.setStyle({ style: Style.Light });
  if (Capacitor.getPlatform() === 'android') {
    await StatusBar.setBackgroundColor({ color: '#006d43' });
  }

  const { SplashScreen } = await import('@capacitor/splash-screen');
  await SplashScreen.hide();
}
