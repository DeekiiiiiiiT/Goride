import { useState, useEffect } from 'react';

export function useNetworkStatus(delay = 2000) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    let timeoutId: any;

    const handleOnline = () => {
        // Debounce online event to ensure stability before triggering syncs
        timeoutId = setTimeout(() => setIsOnline(true), delay);
    };

    const handleOffline = () => {
        // Immediate offline status to prevent failed requests
        clearTimeout(timeoutId);
        setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(timeoutId);
    };
  }, [delay]);

  return isOnline;
}
