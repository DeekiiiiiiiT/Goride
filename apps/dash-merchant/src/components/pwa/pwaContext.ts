import { createContext, useContext } from 'react';

export type PwaContextValue = {
  appName: string;
  standalone: boolean;
  /** Show floating install banner (not dismissed). */
  canInstall: boolean;
  /** Browser can prompt install (Account / settings CTA). */
  canInstallAnytime: boolean;
  installing: boolean;
  promptInstall: () => Promise<boolean>;
  dismissInstall: () => void;
  needRefresh: boolean;
  applyUpdate: () => void;
  dismissUpdate: () => void;
};

/** Stable module so Vite HMR of PwaProvider does not mint a new Context identity. */
export const PwaContext = createContext<PwaContextValue | null>(null);

export function usePwa(): PwaContextValue {
  const ctx = useContext(PwaContext);
  if (!ctx) {
    throw new Error('usePwa must be used within PwaProvider');
  }
  return ctx;
}
