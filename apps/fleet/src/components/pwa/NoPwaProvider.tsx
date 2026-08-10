import React, { useMemo, type ReactNode } from 'react';
import { PwaContext, type PwaContextValue } from './pwaContext';

/**
 * Marketing / non-installable hosts: same context shape, zero SW / install / update UI.
 * Never call useRegisterSW here — that is what resurrects update banners on apex.
 */
export function NoPwaProvider({ children }: { children: ReactNode }) {
  const value = useMemo<PwaContextValue>(
    () => ({
      appName: 'Roam Enterprise',
      standalone: false,
      canInstall: false,
      canInstallAnytime: false,
      installing: false,
      promptInstall: async () => false,
      dismissInstall: () => undefined,
      needRefresh: false,
      applyUpdate: () => undefined,
      dismissUpdate: () => undefined,
    }),
    [],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}
