import { useEffect } from 'react';

/** Locks document scroll and enables immersive safe-area offsets for full-screen flows. */
export function useImmersiveMode(active: boolean) {
  useEffect(() => {
    if (!active) return;

    document.documentElement.classList.add('app-immersive-mode');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.documentElement.classList.remove('app-immersive-mode');
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);
}
