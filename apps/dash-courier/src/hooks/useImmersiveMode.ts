import { useEffect } from 'react';

/** Locks document scroll and applies immersive CSS while active (offers, delivery, maps). */
export function useImmersiveMode(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;

    const html = document.documentElement;
    const prevOverflow = document.body.style.overflow;
    html.classList.add('app-immersive-mode');
    document.body.style.overflow = 'hidden';

    return () => {
      html.classList.remove('app-immersive-mode');
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);
}
