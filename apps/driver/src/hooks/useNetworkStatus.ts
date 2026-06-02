import { useState, useEffect, useRef } from 'react';
import {
  dispatchRoamOffline,
  dispatchRoamReconnected,
  dispatchResetErrorBoundary,
} from '../utils/networkReconnect';

export function useNetworkStatus(delay = 2000) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const wasOnlineRef = useRef(isOnline);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const handleOnline = () => {
      timeoutId = setTimeout(() => {
        setIsOnline(true);
        if (!wasOnlineRef.current) {
          dispatchRoamReconnected();
          dispatchResetErrorBoundary();
        }
        wasOnlineRef.current = true;
      }, delay);
    };

    const handleOffline = () => {
      if (timeoutId) clearTimeout(timeoutId);
      setIsOnline(false);
      if (wasOnlineRef.current) {
        dispatchRoamOffline();
      }
      wasOnlineRef.current = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [delay]);

  return isOnline;
}
