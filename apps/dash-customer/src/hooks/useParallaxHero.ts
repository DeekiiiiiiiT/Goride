import { useEffect, useState } from 'react';

export function useParallaxHero(maxOffset = 80) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setOffset(Math.min(y * 0.4, maxOffset));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [maxOffset]);

  return offset;
}
