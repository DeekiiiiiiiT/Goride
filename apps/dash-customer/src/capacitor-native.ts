import { Capacitor } from '@capacitor/core';
import { handleDashCustomerAuthCallbackUrl } from '@/lib/dashCustomerAuthCallback';
import { isDashCustomerAuthCallbackUrl } from '@/lib/dashCustomerAuth';

async function finishNativeAuthFromUrl(url: string): Promise<void> {
  const accepted = isDashCustomerAuthCallbackUrl(url);
  // #region agent log
  fetch('http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'be05d1'},body:JSON.stringify({sessionId:'be05d1',runId:'pre-fix',hypothesisId:'D',location:'capacitor-native.ts:finishNativeAuthFromUrl:entry',message:'deep link received',data:{accepted,urlScheme:url.split(':')[0]??null,urlHost:(()=>{try{return new URL(url.replace(/^([^:]+:\/\/)/,'https://')).host}catch{return null}})(),hasCode:url.includes('code='),hasAccessToken:url.includes('access_token')},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!accepted) return;
  const handled = await handleDashCustomerAuthCallbackUrl(url);
  // #region agent log
  fetch('http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'be05d1'},body:JSON.stringify({sessionId:'be05d1',runId:'pre-fix',hypothesisId:'D',location:'capacitor-native.ts:finishNativeAuthFromUrl:done',message:'deep link session exchange result',data:{handled},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
