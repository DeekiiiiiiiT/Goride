import { useEffect, useState } from 'react';

/** Browser online/offline with debounced reconnect signal. */
export function useRiderOnline(reconnectDelayMs = 1500) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let wasOnline = navigator.onLine;

    const handleOnline = () => {
      timeoutId = setTimeout(() => {
        setIsOnline(true);
        if (!wasOnline) {
          setJustReconnected(true);
          reconnectTimer = setTimeout(() => setJustReconnected(false), 2500);
        }
        wasOnline = true;
      }, reconnectDelayMs);
    };

    const handleOffline = () => {
      if (timeoutId) clearTimeout(timeoutId);
      setIsOnline(false);
      wasOnline = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timeoutId) clearTimeout(timeoutId);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [reconnectDelayMs]);

  return { isOnline, justReconnected };
}
