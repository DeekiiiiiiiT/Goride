import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  getPwaAppName,
  isStandaloneDisplay,
  type BeforeInstallPromptEvent,
} from '../../pwa/pwaMeta';
import { IS_ENTERPRISE_PRODUCT } from '../../config/productLine';
import { PwaContext, type PwaContextValue } from './pwaContext';
import { PwaLifecycleHost } from './PwaLifecycleHost';

export { usePwa } from './pwaContext';

const DISMISS_INSTALL_KEY = IS_ENTERPRISE_PRODUCT
  ? 'roam-enterprise-pwa-install-dismissed'
  : 'roam-fleet-pwa-install-dismissed';

function wasInstallDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_INSTALL_KEY) === '1';
  } catch {
    return false;
  }
}

function markInstallDismissed(): void {
  try {
    localStorage.setItem(DISMISS_INSTALL_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const appName = getPwaAppName();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstallPrompt, setCanInstallPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(wasInstallDismissed);
  const standalone = isStandaloneDisplay();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        const intervalMs = 60 * 60 * 1000;
        window.setInterval(() => {
          void registration.update();
        }, intervalMs);
      }
      if (import.meta.env.DEV) {
        console.info('[pwa] SW registered', swUrl);
      }
    },
    onRegisterError(error) {
      console.error('[pwa] SW registration failed', error);
    },
  });

  useEffect(() => {
    // Sync document title for enterprise builds (index.html defaults to Roam Fleet).
    document.title = appName;
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute('content', appName);
    const appNameMeta = document.querySelector('meta[name="application-name"]');
    if (appNameMeta) appNameMeta.setAttribute('content', appName);
  }, [appName]);

  useEffect(() => {
    if (standalone) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setCanInstallPrompt(true);
    };

    const onInstalled = () => {
      setInstallEvent(null);
      setCanInstallPrompt(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [standalone]);

  const promptInstall = useCallback(async () => {
    if (!installEvent) return false;
    setInstalling(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      setCanInstallPrompt(false);
      return choice.outcome === 'accepted';
    } catch (err) {
      console.error('[pwa] install prompt failed', err);
      return false;
    } finally {
      setInstalling(false);
    }
  }, [installEvent]);

  const dismissInstall = useCallback(() => {
    markInstallDismissed();
    setDismissed(true);
  }, []);

  const applyUpdate = useCallback(() => {
    void updateServiceWorker(true);
  }, [updateServiceWorker]);

  // Enterprise only: recover installs where the Update CTA was invisible / dismissed.
  useEffect(() => {
    if (!IS_ENTERPRISE_PRODUCT || !needRefresh) return;
    const apply = () => {
      void updateServiceWorker(true);
    };
    const t = window.setTimeout(apply, 8_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') apply();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [needRefresh, updateServiceWorker]);

  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false);
  }, [setNeedRefresh]);

  const value = useMemo<PwaContextValue>(
    () => ({
      appName,
      standalone,
      canInstall: canInstallPrompt && !standalone && !dismissed,
      canInstallAnytime: canInstallPrompt && !standalone,
      installing,
      promptInstall,
      dismissInstall,
      needRefresh,
      applyUpdate,
      dismissUpdate,
    }),
    [
      appName,
      standalone,
      canInstallPrompt,
      dismissed,
      installing,
      promptInstall,
      dismissInstall,
      needRefresh,
      applyUpdate,
      dismissUpdate,
    ],
  );

  // Host lives inside the provider so install/update chrome cannot mount outside context.
  return (
    <PwaContext.Provider value={value}>
      <PwaLifecycleHost />
      {children}
    </PwaContext.Provider>
  );
}
