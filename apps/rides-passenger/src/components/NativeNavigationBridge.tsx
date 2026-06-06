import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setNativeNavigationHandler } from '@/utils/nativeNavigation';

/** Registers React Router navigate for Capacitor deep links. */
export function NativeNavigationBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    setNativeNavigationHandler((path) => navigate(path));
    return () => setNativeNavigationHandler(null);
  }, [navigate]);

  return null;
}
