import { useEffect } from 'react';

/** Locks document scroll and hides bottom-nav offset while a full-screen flow is active. */
export function useImmersiveMode(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const previousOverflow = document.body.style.overflow;
    document.documentElement.classList.add('app-immersive-mode');
    document.body.style.overflow = 'hidden';

    return () => {
      document.documentElement.classList.remove('app-immersive-mode');
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}
