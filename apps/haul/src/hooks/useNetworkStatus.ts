import { useEffect, useState } from 'react';

export function useNetworkStatus(): { online: boolean; retry: () => void } {
  const [online, setOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const retry = () => {
    setOnline(navigator.onLine);
    if (navigator.onLine) window.location.reload();
  };

  return { online, retry };
}
