import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  getPwaAppName,
  isPwaInstallAllowed,
  isStandaloneDisplay,
  type BeforeInstallPromptEvent,
} from '../../pwa/pwaMeta';
import { PwaContext, type PwaContextValue } from './pwaContext';
import { PwaLifecycleHost } from './PwaLifecycleHost';

export { usePwa } from './pwaContext';

const DISMISS_INSTALL_KEY = 'roam-partner-pwa-install-dismissed';

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
  const installAllowed = isPwaInstallAllowed();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstallPrompt, setCanInstallPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(wasInstallDismissed);
  const standalone = isStandaloneDisplay();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: installAllowed,
    onRegisteredSW(swUrl, registration) {
      if (!installAllowed) {
        if (registration) void registration.unregister();
        return;
      }
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
      if (!installAllowed) return;
      console.error('[pwa] SW registration failed', error);
    },
  });

  useEffect(() => {
    if (installAllowed) return;
    // Native shell: strip installability signals and any leftover SW.
    document.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove());
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
    }
  }, [installAllowed]);

  useEffect(() => {
    if (standalone || !installAllowed) return;

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
  }, [standalone, installAllowed]);

  const promptInstall = useCallback(async () => {
    if (!installAllowed || !installEvent) return false;
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
  }, [installEvent, installAllowed]);

  const dismissInstall = useCallback(() => {
    markInstallDismissed();
    setDismissed(true);
  }, []);

  const applyUpdate = useCallback(() => {
    void updateServiceWorker(true);
  }, [updateServiceWorker]);

  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false);
  }, [setNeedRefresh]);

  const value = useMemo<PwaContextValue>(
    () => ({
      appName,
      standalone,
      canInstall: installAllowed && canInstallPrompt && !standalone && !dismissed,
      canInstallAnytime: installAllowed && canInstallPrompt && !standalone,
      installing,
      promptInstall,
      dismissInstall,
      needRefresh: installAllowed && needRefresh,
      applyUpdate,
      dismissUpdate,
    }),
    [
      appName,
      standalone,
      installAllowed,
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

  return (
    <PwaContext.Provider value={value}>
      {installAllowed ? <PwaLifecycleHost /> : null}
      {children}
    </PwaContext.Provider>
  );
}
