import { useEffect, useState } from 'react';

export function useCountdown(initialSeconds: number, onExpire?: () => void) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) {
      onExpire?.();
      return undefined;
    }
    const timer = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, onExpire]);

  const progress = initialSeconds > 0 ? seconds / initialSeconds : 0;

  return { seconds, progress, reset: () => setSeconds(initialSeconds) };
}
