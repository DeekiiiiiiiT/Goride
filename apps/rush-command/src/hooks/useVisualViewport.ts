import { useEffect, useState } from 'react';

/**
 * Returns extra bottom inset when the on-screen keyboard shrinks the visual viewport.
 * Pair with `interactive-widget=resizes-content` in the viewport meta tag.
 */
export function useVisualViewport() {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const gap = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(Math.round(gap));
    };

    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return keyboardInset;
}
