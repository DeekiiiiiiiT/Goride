import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { readCachedResponse, writeCachedResponse } from './cache';
import { builtInDefaults } from './defaults';
import { deriveResolvedConfig } from './deriveView';
import { detectPlatform } from './detectPlatform';
import { fetchAppConfig } from './fetchAppConfig';
import type {
  AppConfigPlatform,
  AppConfigResponse,
  ResolvedAppConfig,
  RushAppId,
} from './types';

const POLL_MS = 5 * 60 * 1000;
const ETAG_KEY = 'rush-app-config:etag:v1:';

export type AppConfigProviderProps = {
  app: RushAppId;
  /** e.g. API_ENDPOINTS.delivery */
  deliveryBaseUrl: string;
  /** Semver of the running app (import.meta.env.VITE_APP_VERSION or package version). */
  appVersion?: string;
  platform?: AppConfigPlatform;
  marketId?: string | null;
  children: React.ReactNode;
};

type AppConfigContextValue = {
  app: RushAppId;
  config: ResolvedAppConfig;
  refresh: () => void;
  ready: boolean;
};

const AppConfigContext = createContext<AppConfigContextValue | null>(null);

function readEtag(app: RushAppId): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(`${ETAG_KEY}${app}`);
  } catch {
    return null;
  }
}

function writeEtag(app: RushAppId, etag: string | null): void {
  if (typeof localStorage === 'undefined' || !etag) return;
  try {
    localStorage.setItem(`${ETAG_KEY}${app}`, etag);
  } catch {
    /* ignore */
  }
}

function initialConfig(
  app: RushAppId,
  appVersion: string,
  platform: AppConfigPlatform,
): ResolvedAppConfig {
  const cached = readCachedResponse(app);
  if (cached) {
    return deriveResolvedConfig(app, cached, {
      appVersion,
      platform,
      source: 'cache',
    });
  }
  return builtInDefaults(app);
}

export function AppConfigProvider({
  app,
  deliveryBaseUrl,
  appVersion = '0.1.0',
  platform: platformProp,
  marketId = null,
  children,
}: AppConfigProviderProps) {
  const platform = platformProp ?? detectPlatform();
  const [config, setConfig] = useState<ResolvedAppConfig>(() =>
    initialConfig(app, appVersion, platform),
  );
  const [ready, setReady] = useState(false);
  const etagRef = useRef<string | null>(readEtag(app));
  const lastBodyRef = useRef<AppConfigResponse | null>(readCachedResponse(app));
  const abortRef = useRef<AbortController | null>(null);

  const applyBody = useCallback(
    (body: AppConfigResponse, source: 'network' | 'cache') => {
      lastBodyRef.current = body;
      writeCachedResponse(app, body);
      setConfig(
        deriveResolvedConfig(app, body, {
          appVersion,
          platform,
          source,
        }),
      );
    },
    [app, appVersion, platform],
  );

  const refresh = useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    void (async () => {
      const result = await fetchAppConfig({
        deliveryBaseUrl,
        app,
        version: appVersion,
        platform,
        marketId,
        etag: etagRef.current,
        signal: ac.signal,
      });

      if (ac.signal.aborted) return;

      if (result.ok && result.status === 200 && result.body) {
        if (result.etag) {
          etagRef.current = result.etag;
          writeEtag(app, result.etag);
        }
        applyBody(result.body, 'network');
      } else if (result.ok && result.status === 304) {
        if (result.etag) {
          etagRef.current = result.etag;
          writeEtag(app, result.etag);
        }
        if (lastBodyRef.current) {
          setConfig(
            deriveResolvedConfig(app, lastBodyRef.current, {
              appVersion,
              platform,
              source: 'network',
            }),
          );
        }
      } else if (!result.ok) {
        // Failure: keep cache/defaults already in state — never block.
        if (!lastBodyRef.current) {
          const cached = readCachedResponse(app);
          if (cached) applyBody(cached, 'cache');
        }
      }

      setReady(true);
    })();
  }, [app, appVersion, applyBody, deliveryBaseUrl, marketId, platform]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      abortRef.current?.abort();
    };
  }, [refresh]);

  const value = useMemo<AppConfigContextValue>(
    () => ({ app, config, refresh, ready }),
    [app, config, ready, refresh],
  );

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

/**
 * Fetch + cache Rush app-config for the given app.
 * Must be used under AppConfigProvider for the same app.
 * Never throws / never blocks — always returns defaults or last cache on failure.
 */
export function useAppConfig(app: RushAppId): ResolvedAppConfig {
  const ctx = useContext(AppConfigContext);
  if (!ctx) {
    return builtInDefaults(app);
  }
  if (ctx.app !== app) {
    return builtInDefaults(app);
  }
  return ctx.config;
}

export function useAppConfigMeta(): { refresh: () => void; ready: boolean } {
  const ctx = useContext(AppConfigContext);
  return {
    refresh: ctx?.refresh ?? (() => undefined),
    ready: ctx?.ready ?? true,
  };
}
