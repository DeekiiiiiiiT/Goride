import { useEffect, useState } from 'react';

/** Returns keyboard overlap height (px) for bottom sheets and forms. */
export function useVisualViewport() {
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const update = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardOffset(offset);
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return keyboardOffset;
}
