import { useEffect, useState, useCallback } from 'react';

export function useResendTimer(initialSeconds = 59) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((prev) => prev - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const canResend = secondsLeft <= 0;
  const formatted = `0:${secondsLeft < 10 ? `0${Math.max(secondsLeft, 0)}` : secondsLeft}`;

  const reset = useCallback(() => {
    setSecondsLeft(initialSeconds);
  }, [initialSeconds]);

  return { secondsLeft, canResend, formatted, reset };
}
