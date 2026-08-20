import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Navigation, Search } from 'lucide-react';
import {
  loadPartnerMapsApi,
  reverseGeocode,
  searchAddresses,
  getPlaceDetails,
  geocodeAddress,
  getCurrentPositionWithAccuracy,
  type LocationValue,
  isLocationComplete,
} from '@roam/location';
import { MaterialIcon } from '../signup/components/MaterialIcon';

const JAMAICA_CENTER = { lat: 18.1096, lng: -77.2975 };
const DEFAULT_ZOOM = 15;
const ZOOM_ON_GPS = 17;

type LocationInputMode = 'search' | 'map';

interface PartnerLocationPickerProps {
  value: Partial<LocationValue> | null;
  onChange: (value: LocationValue) => void;
  disabled?: boolean;
  mapHeightClass?: string;
}

function hasValidCoordinates(value: Partial<LocationValue> | null | undefined): boolean {
  return (
    value?.lat != null &&
    value?.lng != null &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    !(value.lat === 0 && value.lng === 0)
  );
}

function emptyLocation(patch: Partial<LocationValue> = {}): LocationValue {
  return {
    lat: 0,
    lng: 0,
    streetAddress: '',
    city: '',
    postalCode: '',
    formattedAddress: '',
    ...patch,
  };
}

export default function PartnerLocationPicker({
  value,
  onChange,
  disabled = false,
  mapHeightClass = 'h-[320px] md:h-[400px]',
}: PartnerLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualGeocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<LocationInputMode>('search');
  const skipIdleRef = useRef(false);

  const [mode, setMode] = useState<LocationInputMode>(() =>
    hasValidCoordinates(value) ? 'map' : 'search',
  );
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [searchQuery, setSearchQuery] = useState(value?.formattedAddress || '');
  const [suggestions, setSuggestions] = useState<
    Array<{ placeId: string; description: string; mainText: string; secondaryText: string }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  modeRef.current = mode;

  const applyGeocode = useCallback(
    (result: {
      lat: number;
      lng: number;
      formattedAddress: string;
      streetAddress: string;
      city: string;
      postalCode: string;
      placeId?: string;
    }) => {
      onChange({
        lat: result.lat,
        lng: result.lng,
        formattedAddress: result.formattedAddress,
        streetAddress: result.streetAddress,
        city: result.city,
        postalCode: result.postalCode || value?.postalCode || '',
        placeId: result.placeId,
      });
      setSearchQuery(result.formattedAddress);
      setMapError(null);
      setManualError(null);
    },
    [onChange, value?.postalCode],
  );

  const clearCoordinates = useCallback(() => {
    onChange(
      emptyLocation({
        streetAddress: value?.streetAddress || '',
        city: value?.city || '',
        postalCode: value?.postalCode || '',
        formattedAddress: value?.formattedAddress || searchQuery,
      }),
    );
  }, [onChange, searchQuery, value?.city, value?.formattedAddress, value?.postalCode, value?.streetAddress]);

  const panToCoordinates = useCallback((lat: number, lng: number, zoom = ZOOM_ON_GPS) => {
    mapRef.current?.panTo({ lat, lng });
    mapRef.current?.setZoom(zoom);
    accuracyCircleRef.current?.setCenter({ lat, lng });
  }, []);

  const reverseGeocodeCenter = useCallback(
    (lat: number, lng: number) => {
      if (modeRef.current !== 'map') return;
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => {
        void reverseGeocode(lat, lng)
          .then(applyGeocode)
          .catch(() => {
            setLocationError('Could not resolve this pin to an address. Try dragging the map again.');
          });
      }, 400);
    },
    [applyGeocode],
  );

  const reverseGeocodeCenterRef = useRef(reverseGeocodeCenter);
  reverseGeocodeCenterRef.current = reverseGeocodeCenter;

  const initMap = useCallback(async () => {
    if (!containerRef.current || mapRef.current) return;
    try {
      await loadPartnerMapsApi();
      if (!containerRef.current) return;

      const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
      const center = hasValidCoordinates(value)
        ? { lat: value!.lat!, lng: value!.lng! }
        : JAMAICA_CENTER;

      const map = new Map(containerRef.current, {
        center,
        zoom: hasValidCoordinates(value) ? DEFAULT_ZOOM : 10,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: disabled ? 'none' : 'greedy',
        clickableIcons: false,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }],
          },
        ],
      });

      mapRef.current = map;

      accuracyCircleRef.current = new google.maps.Circle({
        map,
        center,
        radius: 0,
        fillColor: '#006B5F',
        fillOpacity: 0.12,
        strokeColor: '#006B5F',
        strokeOpacity: 0.35,
        strokeWeight: 1,
        visible: false,
      });

      map.addListener('dragstart', () => setIsDragging(true));
      map.addListener('dragend', () => setIsDragging(false));

      map.addListener('idle', () => {
        if (disabled || modeRef.current !== 'map' || skipIdleRef.current) return;
        const mapCenter = map.getCenter();
        if (!mapCenter) return;
        reverseGeocodeCenterRef.current(mapCenter.lat(), mapCenter.lng());
      });

      setMapStatus('ready');
      setMapError(null);
    } catch (err) {
      setMapStatus('error');
      setMapError(err instanceof Error ? err.message : 'Maps failed to load');
    }
  }, [disabled, value]);

  useEffect(() => {
    if (mode === 'map') {
      void initMap();
    }
  }, [mode, initMap]);

  useEffect(() => {
    if (mode !== 'map' || !mapRef.current || !hasValidCoordinates(value)) return;
    skipIdleRef.current = true;
    panToCoordinates(value!.lat!, value!.lng!);
    window.setTimeout(() => {
      skipIdleRef.current = false;
    }, 500);
  }, [mode, value?.lat, value?.lng, panToCoordinates]);

  useEffect(() => {
    const circle = accuracyCircleRef.current;
    if (!circle || mode !== 'map' || accuracyMeters == null || accuracyMeters <= 0) {
      circle?.setVisible(false);
      return;
    }
    if (hasValidCoordinates(value)) {
      circle.setCenter({ lat: value!.lat!, lng: value!.lng! });
    }
    circle.setRadius(accuracyMeters);
    circle.setVisible(true);
  }, [accuracyMeters, mode, value?.lat, value?.lng]);

  const switchMode = (next: LocationInputMode) => {
    if (next === mode) return;
    setMode(next);
    setLocationError(null);
    setManualError(null);
    setSuggestions([]);
    setShowSuggestions(false);
    setAccuracyMeters(null);
    accuracyCircleRef.current?.setVisible(false);

    if (next === 'search') {
      const formatted = value?.formattedAddress || value?.streetAddress || '';
      setSearchQuery(formatted);
      if (mode === 'map') {
        const street = value?.streetAddress || '';
        const city = value?.city || '';
        const postal = value?.postalCode || '';
        clearCoordinates();
        if (street.trim().length >= 3 && city.trim().length >= 2) {
          scheduleManualGeocode(street, city, postal);
        }
      }
      return;
    }

    setSearchQuery('');
    onChange(emptyLocation());
    void initMap();
  };

  const useMyLocation = useCallback(async () => {
    setIsLocating(true);
    setLocationError(null);
    setManualError(null);
    try {
      const position = await getCurrentPositionWithAccuracy();
      setAccuracyMeters(position.accuracyMeters);

      if (modeRef.current === 'map') {
        skipIdleRef.current = true;
        panToCoordinates(position.lat, position.lng, ZOOM_ON_GPS);
        window.setTimeout(() => {
          skipIdleRef.current = false;
        }, 500);
      }

      await reverseGeocode(position.lat, position.lng).then(applyGeocode);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not get your location';
      if (modeRef.current === 'map') {
        setLocationError(message);
      } else {
        setManualError(message);
      }
    } finally {
      setIsLocating(false);
    }
  }, [applyGeocode, panToCoordinates]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setManualError(null);
    clearCoordinates();
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      onChange(emptyLocation());
      return;
    }
    onChange(
      emptyLocation({
        formattedAddress: query,
        streetAddress: value?.streetAddress || '',
        city: value?.city || '',
        postalCode: value?.postalCode || '',
      }),
    );
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
    setIsResolving(true);
    setManualError(null);
    try {
      const details = await getPlaceDetails(placeId);
      applyGeocode(details);
    } catch {
      setManualError('Could not load that address. Try another suggestion.');
    } finally {
      setIsResolving(false);
    }
  };

  const scheduleManualGeocode = useCallback(
    (streetAddress: string, city: string, postalCode: string) => {
      if (manualGeocodeTimeoutRef.current) clearTimeout(manualGeocodeTimeoutRef.current);
      if (streetAddress.trim().length < 3 || city.trim().length < 2) return;

      manualGeocodeTimeoutRef.current = setTimeout(() => {
        const query = [streetAddress, city, postalCode, 'Jamaica'].filter(Boolean).join(', ');
        setIsResolving(true);
        setManualError(null);
        void geocodeAddress(query)
          .then((result) => {
            applyGeocode({
              ...result,
              formattedAddress: result.formattedAddress || query,
            });
          })
          .catch(() => {
            setManualError('Could not find that address. Check the street and parish, or use search above.');
          })
          .finally(() => setIsResolving(false));
      }, 600);
    },
    [applyGeocode],
  );

  const updateManualField = (patch: Partial<LocationValue>) => {
    const next = emptyLocation({
      streetAddress: patch.streetAddress ?? value?.streetAddress ?? '',
      city: patch.city ?? value?.city ?? '',
      postalCode: patch.postalCode ?? value?.postalCode ?? '',
      formattedAddress: patch.formattedAddress ?? value?.formattedAddress ?? searchQuery,
    });
    onChange(next);
    setManualError(null);
    scheduleManualGeocode(next.streetAddress, next.city, next.postalCode);
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
  const resolving = isResolving || isLocating;

  return (
    <div className="flex flex-col gap-inset-md">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-outline-variant bg-surface-container-low p-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => switchMode('search')}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-label-lg font-medium transition-colors ${
            mode === 'search'
              ? 'bg-surface text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Search className="h-4 w-4" />
          Type address
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => switchMode('map')}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-label-lg font-medium transition-colors ${
            mode === 'map'
              ? 'bg-surface text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <Navigation className="h-4 w-4" />
          Pin on map
        </button>
      </div>

      <button
        type="button"
        onClick={() => void useMyLocation()}
        disabled={disabled || isLocating || (mode === 'map' && mapStatus === 'loading')}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary-container/30 text-label-lg font-semibold text-primary transition-all hover:bg-primary-container/50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLocating ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Getting your location…
          </>
        ) : (
          <>
            <Navigation className="h-5 w-5" />
            Use current location
          </>
        )}
      </button>

      {mode === 'search' ? (
        <>
          <div className="relative">
            <MaterialIcon
              name="search"
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              type="text"
              disabled={disabled || resolving}
              className="h-[56px] w-full rounded-lg border border-outline-variant bg-surface pl-12 pr-4 text-body-lg text-on-surface shadow-sm transition-all placeholder:text-on-surface-variant/60 partner-field disabled:opacity-60"
              placeholder="Search address or landmark"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            {resolving && (
              <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-primary" />
            )}
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-outline-variant bg-surface shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.placeId}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 px-4 py-3 text-left text-body-sm hover:bg-surface-container-low"
                      onMouseDown={() => void selectSuggestion(s.placeId, s.description)}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>
                        <div className="font-medium text-on-surface">{s.mainText}</div>
                        {s.secondaryText && (
                          <div className="text-label-sm text-on-surface-variant">{s.secondaryText}</div>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-label-sm text-on-surface-variant">
            Pick a suggestion, use current location, or enter your address below.
          </p>

          <div className="flex flex-col gap-inset-sm">
            <div className="group relative">
              <label className="absolute left-4 top-2 z-10 text-label-sm text-on-surface-variant" htmlFor="partner-street">
                Street address
              </label>
              <input
                id="partner-street"
                type="text"
                disabled={disabled || resolving}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 pb-2 pt-6 text-body-lg text-on-surface shadow-sm partner-field"
                value={value?.streetAddress || ''}
                onChange={(e) => updateManualField({ streetAddress: e.target.value })}
              />
            </div>
            <div className="group relative">
              <label className="absolute left-4 top-2 z-10 text-label-sm text-on-surface-variant" htmlFor="partner-city">
                City / Parish
              </label>
              <input
                id="partner-city"
                type="text"
                disabled={disabled || resolving}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 pb-2 pt-6 text-body-lg text-on-surface shadow-sm partner-field"
                value={value?.city || ''}
                onChange={(e) => updateManualField({ city: e.target.value })}
              />
            </div>
            <div className="group relative">
              <label className="absolute left-4 top-2 z-10 text-label-sm text-on-surface-variant" htmlFor="partner-postal">
                Postal code (Optional)
              </label>
              <input
                id="partner-postal"
                type="text"
                disabled={disabled || resolving}
                className="w-full rounded-lg border border-outline-variant bg-surface px-4 pb-2 pt-6 text-body-lg text-on-surface shadow-sm partner-field"
                placeholder="e.g. JMAWK03"
                value={value?.postalCode || ''}
                onChange={(e) => updateManualField({ postalCode: e.target.value })}
              />
            </div>
          </div>

          {manualError && (
            <p className="rounded-lg border border-warning-container/40 bg-warning-container/20 px-4 py-2 text-body-sm text-on-surface-variant">
              {manualError}
            </p>
          )}
        </>
      ) : (
        <>
          {mapError && (
            <p className="rounded-lg border border-error/30 bg-error-container/20 px-4 py-2 text-body-sm text-error">
              {mapError}
            </p>
          )}
          {locationError && (
            <p className="rounded-lg border border-warning-container/40 bg-warning-container/20 px-4 py-2 text-body-sm text-on-surface-variant">
              {locationError}
            </p>
          )}

          <div
            className={`group relative w-full overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low shadow-sm ${mapHeightClass}`}
          >
            {mapStatus === 'error' ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <MaterialIcon name="map" className="text-on-surface-variant/50" size={32} />
                <p className="text-body-sm text-on-surface-variant">
                  Map unavailable — switch to type address, or try again later.
                </p>
              </div>
            ) : (
              <>
                <div ref={containerRef} className="h-full w-full" />
                {mapStatus === 'loading' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-surface/80">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
              </>
            )}

            {!disabled && mapStatus === 'ready' && (
              <>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    className={`relative -top-4 flex flex-col items-center drop-shadow-md transition-transform ${
                      isDragging ? 'scale-110 -translate-y-1' : ''
                    }`}
                  >
                    <div className="mb-1 whitespace-nowrap rounded-full bg-primary px-3 py-1.5 text-label-sm font-medium text-on-primary shadow-sm">
                      Drag map to adjust
                    </div>
                    <MaterialIcon name="location_on" filled className="text-error" size={40} />
                  </div>
                </div>

                {accuracyMeters != null && accuracyMeters > 50 && (
                  <div className="absolute left-3 right-14 top-3 z-10">
                    <div className="rounded-lg border border-warning-container/50 bg-warning-container/90 px-3 py-2 text-label-sm text-on-surface shadow-sm">
                      GPS accuracy ~{Math.round(accuracyMeters)}m — drag the map to fine-tune
                    </div>
                  </div>
                )}

                <div className="absolute bottom-4 right-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void useMyLocation()}
                    disabled={isLocating}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface text-primary shadow-sm transition-all hover:bg-surface-container-low active:scale-95 disabled:opacity-50"
                    aria-label="Use my location"
                  >
                    {isLocating ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Navigation className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={zoomIn}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface shadow-sm transition-all hover:bg-surface-container-low active:scale-95"
                    aria-label="Zoom in"
                  >
                    <MaterialIcon name="add" />
                  </button>
                  <button
                    type="button"
                    onClick={zoomOut}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface shadow-sm transition-all hover:bg-surface-container-low active:scale-95"
                    aria-label="Zoom out"
                  >
                    <MaterialIcon name="remove" />
                  </button>
                </div>
              </>
            )}
          </div>

          {hasValidCoordinates(value) && (
            <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-body-sm text-on-surface-variant">
              <p className="font-medium text-on-surface">{value?.streetAddress || 'Address pending'}</p>
              <p>
                {[value?.city, value?.postalCode].filter(Boolean).join(', ') || 'City / parish'}
              </p>
            </div>
          )}
        </>
      )}

      {!complete && (
        <p className="text-label-sm text-on-surface-variant">
          {mode === 'search'
            ? 'Use current location to fill the fields automatically, or search and type your address manually.'
            : 'Use current location or drag the map until the pin matches your storefront.'}
        </p>
      )}
    </div>
  );
}

export { isLocationComplete };
