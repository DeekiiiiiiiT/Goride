import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { readBuildTimeVersionInfo, type AppVersionInfo } from '@/lib/appVersion';

export function useAppVersionInfo(): AppVersionInfo {
  const [info, setInfo] = useState<AppVersionInfo>(readBuildTimeVersionInfo);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const appInfo = await App.getInfo();
        const version = appInfo.version?.trim();
        if (!version || cancelled) return;
        setInfo((prev) => ({ ...prev, version }));
      } catch {
        /* keep build-time fallback */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
