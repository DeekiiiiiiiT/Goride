import React, { createContext, useContext, useEffect, useMemo } from 'react';
import {
  bindPlatformSessionAuth,
  buildAuthHeadersFromToken,
} from './platformAuthHeaders';

export type PlatformSessionValue = {
  accessToken: string | null;
  getAuthHeaders: (contentType?: string | null) => Promise<Record<string, string>>;
};

const PlatformSessionContext = createContext<PlatformSessionValue>({
  accessToken: null,
  getAuthHeaders: async (contentType) => buildAuthHeadersFromToken(null, contentType),
});

export type PlatformSessionProviderProps = {
  accessToken: string | null;
  /** Optional override; defaults to building headers from accessToken + @roam/api-client. */
  getAuthHeaders?: (contentType?: string | null) => Promise<Record<string, string>>;
  children: React.ReactNode;
};

/**
 * Injects the host app's session JWT into platform-ops UI + services.
 * Mount under each app's AuthProvider and pass session.access_token.
 */
export function PlatformSessionProvider({
  accessToken,
  getAuthHeaders: getAuthHeadersProp,
  children,
}: PlatformSessionProviderProps) {
  const value = useMemo<PlatformSessionValue>(() => {
    const getAuthHeaders: PlatformSessionValue['getAuthHeaders'] =
      getAuthHeadersProp ??
      (async (contentType = 'application/json') =>
        // Preserve explicit null (omit Content-Type); only default when omitted.
        buildAuthHeadersFromToken(accessToken, contentType));

    return { accessToken, getAuthHeaders };
  }, [accessToken, getAuthHeadersProp]);

  useEffect(() => {
    bindPlatformSessionAuth({
      accessToken: value.accessToken,
      getAuthHeaders: value.getAuthHeaders,
    });
    return () => {
      bindPlatformSessionAuth({ accessToken: null, getAuthHeaders: undefined });
    };
  }, [value]);

  return (
    <PlatformSessionContext.Provider value={value}>{children}</PlatformSessionContext.Provider>
  );
}

export function usePlatformSession(): PlatformSessionValue {
  return useContext(PlatformSessionContext);
}
