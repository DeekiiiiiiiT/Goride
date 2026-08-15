import { Capacitor } from '@capacitor/core';
import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import { nativePushEndpoint, urlBase64ToUint8Array } from '@/lib/rushPushCodec';

export { nativePushEndpoint, urlBase64ToUint8Array } from '@/lib/rushPushCodec';

const NATIVE_TOKEN_STORAGE_KEY = 'roam_rush_native_push_token';
const WEB_ENDPOINT_STORAGE_KEY = 'roam_rush_web_push_endpoint';

export type RushPushChannel = 'web' | 'fcm' | 'apns';

function nativePushChannel(): 'fcm' | 'apns' {
  return Capacitor.getPlatform() === 'ios' ? 'apns' : 'fcm';
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

async function postSubscribe(body: Record<string, unknown>): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  const res = await fetch(`${API_ENDPOINTS.notifications}/subscribe`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, audience: 'customer' }),
  });
  return res.ok || res.status === 201 || res.status === 202;
}

async function postUnsubscribe(endpoint: string): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  const res = await fetch(`${API_ENDPOINTS.notifications}/unsubscribe`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ endpoint, audience: 'customer' }),
  });
  return res.ok;
}

export function isRushPushSupported(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isRushPushSubscribedLocally(): boolean {
  try {
    if (Capacitor.isNativePlatform()) {
      return Boolean(localStorage.getItem(NATIVE_TOKEN_STORAGE_KEY));
    }
    return Boolean(localStorage.getItem(WEB_ENDPOINT_STORAGE_KEY));
  } catch {
    return false;
  }
}

async function subscribeNative(): Promise<void> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') {
    throw new Error('Notification permission denied');
  }

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
  const ok = await postSubscribe({ token, platform: channel });
  if (!ok) throw new Error('Could not save push subscription');
  localStorage.setItem(NATIVE_TOKEN_STORAGE_KEY, token);
}

async function unsubscribeNative(): Promise<void> {
  const token = localStorage.getItem(NATIVE_TOKEN_STORAGE_KEY);
  if (token) {
    await postUnsubscribe(nativePushEndpoint(nativePushChannel(), token));
    localStorage.removeItem(NATIVE_TOKEN_STORAGE_KEY);
  }
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners();
  } catch {
    /* plugin may be unavailable in some shells */
  }
}

async function subscribeWeb(): Promise<void> {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidKey) {
    throw new Error('Push notifications are not configured');
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  const result = await Notification.requestPermission();
  if (result !== 'granted') {
    throw new Error('Notification permission denied');
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const json = subscription.toJSON();
  if (!json.endpoint) throw new Error('Push subscription missing endpoint');

  const ok = await postSubscribe({
    endpoint: json.endpoint,
    keys: json.keys,
  });
  if (!ok) throw new Error('Could not save push subscription');
  localStorage.setItem(WEB_ENDPOINT_STORAGE_KEY, json.endpoint);
}

async function unsubscribeWeb(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  const stored = localStorage.getItem(WEB_ENDPOINT_STORAGE_KEY);
  const endpoint = subscription?.endpoint || stored;

  if (subscription) {
    await subscription.unsubscribe();
  }
  if (endpoint) {
    await postUnsubscribe(endpoint);
  }
  localStorage.removeItem(WEB_ENDPOINT_STORAGE_KEY);
}

/** Subscribe this device for customer order-update push (native or web). */
export async function subscribeRushPush(): Promise<void> {
  if (!isRushPushSupported()) {
    throw new Error('Push notifications are not supported on this device');
  }
  if (Capacitor.isNativePlatform()) {
    await subscribeNative();
    return;
  }
  await subscribeWeb();
}

/** Unsubscribe this device from customer order-update push. */
export async function unsubscribeRushPush(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await unsubscribeNative();
    return;
  }
  await unsubscribeWeb();
}
