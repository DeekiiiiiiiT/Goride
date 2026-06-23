export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeoPositionWithAccuracy {
  lat: number;
  lng: number;
  accuracyMeters: number;
}

const readCurrentPosition = (options: PositionOptions): Promise<GeoCoordinates> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        let message = 'Unknown error getting location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information is unavailable';
            break;
          case error.TIMEOUT:
            message = 'The request to get user location timed out';
            break;
        }
        reject(new Error(message));
      },
      options,
    );
  });

/** Browser Geolocation API — current device position (high accuracy, then coarse fallback). */
export async function getCurrentPosition(): Promise<GeoCoordinates> {
  try {
    return await readCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  } catch (highAccuracyError) {
    console.warn('High-accuracy geolocation failed, retrying:', highAccuracyError);
    return readCurrentPosition({
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 60_000,
    });
  }
}

/** Get current position with accuracy info. */
export function getCurrentPositionWithAccuracy(): Promise<GeoPositionWithAccuracy> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      (error) => {
        let message = 'Unknown error getting location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information is unavailable';
            break;
          case error.TIMEOUT:
            message = 'The request to get user location timed out';
            break;
        }
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
