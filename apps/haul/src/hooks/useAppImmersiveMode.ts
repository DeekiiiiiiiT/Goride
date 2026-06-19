import { useEffect } from 'react';

/** Locks document scroll and sets immersive chrome offsets while a full-screen flow is active. */
export function useAppImmersiveMode(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const root = document.documentElement;
    const prevOverflow = document.body.style.overflow;
    root.classList.add('app-immersive-mode');
    document.body.style.overflow = 'hidden';

    return () => {
      root.classList.remove('app-immersive-mode');
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);
}
