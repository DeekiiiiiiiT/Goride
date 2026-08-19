import { useEffect, useRef, useState } from 'react';

export function useCountdown(initialSeconds: number, onExpire?: () => void) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (seconds <= 0) {
      if (!expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
      return undefined;
    }
    const timer = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, onExpire]);

  const progress = initialSeconds > 0 ? seconds / initialSeconds : 0;
  const isExpired = seconds <= 0;

  return {
    seconds,
    progress,
    isExpired,
    expiredRef,
    reset: () => {
      expiredRef.current = false;
      setSeconds(initialSeconds);
    },
  };
}
