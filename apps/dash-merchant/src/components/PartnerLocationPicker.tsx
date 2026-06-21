import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadPartnerMapsApi,
  reverseGeocode,
  searchAddresses,
  getPlaceDetails,
  type LocationValue,
  isLocationComplete,
} from '@roam/location';
import { MaterialIcon } from '../signup/components/MaterialIcon';

const JAMAICA_CENTER = { lat: 18.1096, lng: -77.2975 };
const DEFAULT_ZOOM = 15;

interface PartnerLocationPickerProps {
  value: Partial<LocationValue> | null;
  onChange: (value: LocationValue) => void;
  disabled?: boolean;
  mapHeightClass?: string;
}

export default function PartnerLocationPicker({
  value,
  onChange,
  disabled = false,
  mapHeightClass = 'h-[320px] md:h-[400px]',
}: PartnerLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [searchQuery, setSearchQuery] = useState(value?.formattedAddress || '');
  const [suggestions, setSuggestions] = useState<
    Array<{ placeId: string; description: string; mainText: string; secondaryText: string }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const applyGeocode = useCallback(
    (result: {
      lat: number;
      lng: number;
      formattedAddress: string;
      streetAddress: string;
      city: string;
      postalCode: string;
    }) => {
      onChange({
        lat: result.lat,
        lng: result.lng,
        formattedAddress: result.formattedAddress,
        streetAddress: result.streetAddress,
        city: result.city,
        postalCode: result.postalCode || value?.postalCode || '',
      });
      setSearchQuery(result.formattedAddress);
    },
    [onChange, value?.postalCode],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadPartnerMapsApi();
        if (cancelled || !containerRef.current) return;

        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        const center = value?.lat != null && value?.lng != null
          ? { lat: value.lat, lng: value.lng }
          : JAMAICA_CENTER;

        const map = new Map(containerRef.current, {
          center,
          zoom: value?.lat != null ? DEFAULT_ZOOM : 10,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: disabled ? 'none' : 'greedy',
          clickableIcons: false,
        });

        mapRef.current = map;

        map.addListener('idle', () => {
          if (disabled) return;
          const center = map.getCenter();
          if (!center) return;
          if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
          idleTimeoutRef.current = setTimeout(() => {
            void reverseGeocode(center.lat(), center.lng())
              .then(applyGeocode)
              .catch(() => {});
          }, 400);
        });

        setMapStatus('ready');
      } catch (err) {
        setMapStatus('error');
        setMapError(err instanceof Error ? err.message : 'Maps failed to load');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [disabled, applyGeocode]);

  useEffect(() => {
    if (!mapRef.current || value?.lat == null || value?.lng == null) return;
    mapRef.current.panTo({ lat: value.lat, lng: value.lng });
  }, [value?.lat, value?.lng]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      void searchAddresses(query)
        .then((items) => {
          setSuggestions(items);
          setShowSuggestions(true);
        })
        .catch(() => setSuggestions([]));
    }, 300);
  };

  const selectSuggestion = async (placeId: string, description: string) => {
    setShowSuggestions(false);
    setSearchQuery(description);
    try {
      const details = await getPlaceDetails(placeId);
      onChange(details);
      mapRef.current?.panTo({ lat: details.lat, lng: details.lng });
      mapRef.current?.setZoom(DEFAULT_ZOOM);
    } catch {
      setMapError('Could not load place details');
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.panTo({ lat: latitude, lng: longitude });
        mapRef.current?.setZoom(DEFAULT_ZOOM);
        void reverseGeocode(latitude, longitude)
          .then(applyGeocode)
          .finally(() => setIsLocating(false));
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const zoomIn = () => {
    const z = mapRef.current?.getZoom();
    if (z != null) mapRef.current?.setZoom(z + 1);
  };

  const zoomOut = () => {
    const z = mapRef.current?.getZoom();
    if (z != null) mapRef.current?.setZoom(z - 1);
  };

  const complete = isLocationComplete(value);

  return (
    <div className="flex flex-col gap-inset-md">
      <div className="relative">
        <MaterialIcon
          name="search"
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-on-surface-variant"
        />
        <input
          type="text"
          disabled={disabled}
          className="h-[56px] w-full rounded-lg border border-outline-variant bg-surface pl-12 pr-4 text-body-lg text-on-surface shadow-sm transition-all placeholder:text-on-surface-variant/60 partner-field disabled:opacity-60"
          placeholder="Search address or landmark"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-outline-variant bg-surface shadow-lg">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left text-body-sm hover:bg-surface-container-low"
                  onMouseDown={() => void selectSuggestion(s.placeId, s.description)}
                >
                  <div className="font-medium text-on-surface">{s.mainText}</div>
                  {s.secondaryText && (
                    <div className="text-label-sm text-on-surface-variant">{s.secondaryText}</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mapError && (
        <p className="rounded-lg border border-error/30 bg-error-container/20 px-4 py-2 text-body-sm text-error">
          {mapError}
        </p>
      )}

      <div
        className={`group relative w-full overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low shadow-sm ${mapHeightClass}`}
      >
        <div ref={containerRef} className="h-full w-full" />
        {mapStatus === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/80">
            <span className="text-body-sm text-on-surface-variant">Loading map…</span>
          </div>
        )}
        {!disabled && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative -top-4 flex flex-col items-center drop-shadow-md">
                <div className="mb-1 whitespace-nowrap rounded-full bg-primary px-3 py-1.5 text-label-sm font-medium text-on-primary shadow-sm">
                  Drag map to adjust
                </div>
                <MaterialIcon name="location_on" filled className="text-error" size={40} />
              </div>
            </div>
            <div className="absolute bottom-4 right-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={isLocating}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface shadow-sm transition-all hover:bg-surface-container-low active:scale-95"
                aria-label="Use my location"
              >
                <MaterialIcon name="my_location" />
              </button>
              <button
                type="button"
                onClick={zoomIn}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface shadow-sm transition-all hover:bg-surface-container-low active:scale-95"
              >
                <MaterialIcon name="add" />
              </button>
              <button
                type="button"
                onClick={zoomOut}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface shadow-sm transition-all hover:bg-surface-container-low active:scale-95"
              >
                <MaterialIcon name="remove" />
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-inset-sm">
        <div className="group relative">
          <label className="absolute left-4 top-2 z-10 text-label-sm text-on-surface-variant" htmlFor="partner-street">
            Street address
          </label>
          <input
            id="partner-street"
            type="text"
            disabled={disabled}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 pb-2 pt-6 text-body-lg text-on-surface shadow-sm partner-field"
            value={value?.streetAddress || ''}
            onChange={(e) =>
              onChange({
                lat: value?.lat ?? 0,
                lng: value?.lng ?? 0,
                streetAddress: e.target.value,
                city: value?.city || '',
                postalCode: value?.postalCode || '',
                formattedAddress: value?.formattedAddress || e.target.value,
              })
            }
          />
        </div>
        <div className="group relative">
          <label className="absolute left-4 top-2 z-10 text-label-sm text-on-surface-variant" htmlFor="partner-city">
            City / Parish
          </label>
          <input
            id="partner-city"
            type="text"
            disabled={disabled}
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 pb-2 pt-6 text-body-lg text-on-surface shadow-sm partner-field"
            value={value?.city || ''}
            onChange={(e) =>
              onChange({
                lat: value?.lat ?? 0,
                lng: value?.lng ?? 0,
                streetAddress: value?.streetAddress || '',
                city: e.target.value,
                postalCode: value?.postalCode || '',
                formattedAddress: value?.formattedAddress || '',
              })
            }
          />
        </div>
        <div className="group relative">
          <label className="absolute left-4 top-2 z-10 text-label-sm text-on-surface-variant" htmlFor="partner-postal">
            Postal code (Optional)
          </label>
          <input
            id="partner-postal"
            type="text"
            disabled={disabled}
            className="w-full rounded-lg border border-outline-variant bg-surface px-4 pb-2 pt-6 text-body-lg text-on-surface shadow-sm partner-field"
            placeholder="e.g. JMAWK03"
            value={value?.postalCode || ''}
            onChange={(e) =>
              onChange({
                lat: value?.lat ?? 0,
                lng: value?.lng ?? 0,
                streetAddress: value?.streetAddress || '',
                city: value?.city || '',
                postalCode: e.target.value,
                formattedAddress: value?.formattedAddress || '',
              })
            }
          />
        </div>
        {!complete && (
          <p className="text-label-sm text-on-surface-variant">
            Select a location on the map to set coordinates before continuing.
          </p>
        )}
      </div>
    </div>
  );
}

export { isLocationComplete };
