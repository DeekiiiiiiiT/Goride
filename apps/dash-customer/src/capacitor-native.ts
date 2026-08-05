import { Capacitor } from '@capacitor/core';

/** Native shell bootstrap (Android/iOS). No-op on web. */
export async function initRushNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
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
