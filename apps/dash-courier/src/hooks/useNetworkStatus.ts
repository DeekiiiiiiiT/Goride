import { useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 1500;

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [wasOffline, setWasOffline] = useState(false);
  const wasOnlineRef = useRef(isOnline);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const handleOnline = () => {
      timeoutId = setTimeout(() => {
        if (!wasOnlineRef.current) {
          setWasOffline(true);
        }
        setIsOnline(true);
        wasOnlineRef.current = true;
      }, DEBOUNCE_MS);
    };

    const handleOffline = () => {
      if (timeoutId) clearTimeout(timeoutId);
      setIsOnline(false);
      wasOnlineRef.current = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const clearWasOffline = () => setWasOffline(false);

  return { isOnline, wasOffline, clearWasOffline };
}
