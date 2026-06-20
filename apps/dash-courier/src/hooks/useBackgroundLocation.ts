import { useEffect, useState } from 'react';

type LocationCoords = { lat: number; lng: number };

export function useBackgroundLocation(enabled: boolean) {
  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [tracking, setTracking] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setTracking(false);
      return undefined;
    }

    setTracking(true);
    setCoords({ lat: 18.0179, lng: -76.8099 });

    const interval = window.setInterval(() => {
      setCoords((prev) =>
        prev
          ? {
              lat: prev.lat + (Math.random() - 0.5) * 0.0002,
              lng: prev.lng + (Math.random() - 0.5) * 0.0002,
            }
          : prev,
      );
    }, 5000);

    return () => {
      window.clearInterval(interval);
      setTracking(false);
    };
  }, [enabled]);

  return { coords, tracking };
}
