import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';
import { deliveryFetch } from '../lib/partner-api';
import { readFlag } from '../lib/partner-feature-flags';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type NativePushChannel = 'fcm' | 'apns';

function nativePushChannel(): NativePushChannel {
  return Capacitor.getPlatform() === 'ios' ? 'apns' : 'fcm';
}

const NATIVE_TOKEN_STORAGE_KEY = 'roam_partner_native_push_token';

export function useWebPush(merchantId: string) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    const flagOn = readFlag(merchantId, 'webPushNotifications');
    if (!flagOn) {
      setIsSupported(false);
      return;
    }

    if (isNative) {
      setIsSupported(true);
      const stored = localStorage.getItem(NATIVE_TOKEN_STORAGE_KEY);
      setIsSubscribed(Boolean(stored));
      setPermission(stored ? 'granted' : 'default');
      return;
    }

    const supported =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    }
  }, [merchantId, isNative]);

  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return null;
    // Prefer the VitePWA registration already active; fall back to legacy /sw.js.
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), 2500);
        }),
      ]);
    }
    if (registration) return registration;
    return navigator.serviceWorker.register('/sw.js');
  }, []);

  const subscribeNative = useCallback(async () => {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      setPermission('denied');
      throw new Error('Notification permission denied');
    }
    setPermission('granted');

    const token = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          void PushNotifications.removeAllListeners();
          reject(new Error('Timed out waiting for push token'));
        }
      }, 20000);

      void PushNotifications.addListener('registration', (event) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(event.value);
      });
      void PushNotifications.addListener('registrationError', (event) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(new Error(event.error || 'Push registration failed'));
      });

      void PushNotifications.register().catch((err: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error('Push registration failed'));
      });
    });

    const channel = nativePushChannel();
    await deliveryFetch('/merchant/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        token,
        platform: channel,
      }),
    });

    localStorage.setItem(NATIVE_TOKEN_STORAGE_KEY, token);
    setIsSubscribed(true);
  }, []);

  const unsubscribeNative = useCallback(async () => {
    const token = localStorage.getItem(NATIVE_TOKEN_STORAGE_KEY);
    if (token) {
      await deliveryFetch('/merchant/push/unsubscribe', {
        method: 'DELETE',
        body: JSON.stringify({
          endpoint: `${nativePushChannel()}:${token}`,
        }),
      });
      localStorage.removeItem(NATIVE_TOKEN_STORAGE_KEY);
    }
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.removeAllListeners();
    } catch {
      /* plugin may be unavailable in some shells */
    }
    setIsSubscribed(false);
  }, []);

  const subscribe = useCallback(async () => {
    if (isNative) {
      await subscribeNative();
      return;
    }

    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapidKey) {
      throw new Error('Push notifications are not configured');
    }

    const registration = await registerServiceWorker();
    if (!registration) throw new Error('Service worker unavailable');

    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== 'granted') {
      throw new Error('Notification permission denied');
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const json = subscription.toJSON();
    await deliveryFetch('/merchant/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    });

    setIsSubscribed(true);
  }, [isNative, registerServiceWorker, subscribeNative]);

  const unsubscribe = useCallback(async () => {
    if (isNative) {
      await unsubscribeNative();
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await deliveryFetch('/merchant/push/unsubscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint }),
      });
    }

    setIsSubscribed(false);
  }, [isNative, unsubscribeNative]);

  useEffect(() => {
    if (!isSupported || isNative) return;

    registerServiceWorker().then((registration) => {
      registration?.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(Boolean(sub));
      });
    });
  }, [isSupported, isNative, registerServiceWorker]);

  return {
    isSupported,
    isSubscribed,
    permission,
    subscribe,
    unsubscribe,
  };
}
