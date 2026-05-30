import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin, Navigation, X } from 'lucide-react';
import {
  type AddressResult,
  debounce,
  getPlaceDetails,
  searchAddress,
} from '@/services/locationService';

export type ResolvedPlace = { address: string; lat: number; lng: number };

type Props = {
  label: React.ReactNode;
  value: string;
  onChangeText: (text: string) => void;
  onResolved: (place: ResolvedPlace) => void;
  placeholder?: string;
  /** Show an X control to clear the field when it has text. */
  clearable?: boolean;
  /** External loading state (e.g. while resolving device location). */
  isLoading?: boolean;
  /** Show a "use my location" button. */
  showLocationButton?: boolean;
  /** Callback when location button is clicked. */
  onLocationClick?: () => void;
  /** Is the location button in loading state. */
  locationLoading?: boolean;
  hideLabel?: boolean;
  inputClassName?: string;
  suggestionsListClassName?: string;
  suggestionButtonClassName?: string;
  /** Portal suggestions so they sit above the mobile keyboard. */
  portalSuggestions?: boolean;
};

function getVisibleViewportBounds() {
  const vv = window.visualViewport;
  if (!vv) {
    return { top: 0, bottom: window.innerHeight };
  }
  return { top: vv.offsetTop, bottom: vv.offsetTop + vv.height };
}

export function RoamPlaceField({
  label,
  value,
  onChangeText,
  onResolved,
  placeholder,
  clearable = false,
  isLoading = false,
  showLocationButton = false,
  onLocationClick,
  locationLoading = false,
  hideLabel = false,
  inputClassName,
  suggestionsListClassName,
  suggestionButtonClassName,
  portalSuggestions = false,
}: Props) {
  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [portalListStyle, setPortalListStyle] = useState<React.CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const performSearch = useCallback(
    debounce(async (query: string) => {
      if (!query || query.length < 3) {
        setSuggestions([]);
        return;
      }
      try {
        const results = await searchAddress(query);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300),
    [],
  );

  const updatePortalPosition = useCallback(() => {
    const input = inputRef.current;
    if (!input || !portalSuggestions) return;

    const rect = input.getBoundingClientRect();
    const { top: visibleTop, bottom: visibleBottom } = getVisibleViewportBounds();
    const spaceBelow = visibleBottom - rect.bottom - 8;
    const spaceAbove = rect.top - visibleTop - 8;
    const openAbove = spaceBelow < 140 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(240, Math.max(120, openAbove ? spaceAbove : spaceBelow));

    setPortalListStyle(
      openAbove
        ? {
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            bottom: window.innerHeight - rect.top + 4,
            maxHeight,
            zIndex: 10000,
          }
        : {
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            top: rect.bottom + 4,
            maxHeight,
            zIndex: 10000,
          },
    );
  }, [portalSuggestions]);

  useLayoutEffect(() => {
    if (!portalSuggestions || !showSuggestions || suggestions.length === 0) return;
    updatePortalPosition();

    const viewport = window.visualViewport;
    if (!viewport) return;

    const onViewportChange = () => updatePortalPosition();
    viewport.addEventListener('resize', onViewportChange);
    viewport.addEventListener('scroll', onViewportChange);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      viewport.removeEventListener('resize', onViewportChange);
      viewport.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [portalSuggestions, showSuggestions, suggestions.length, updatePortalPosition]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (
        portalSuggestions &&
        target instanceof Element &&
        target.closest('[data-roam-place-suggestions]')
      ) {
        return;
      }
      setShowSuggestions(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [portalSuggestions]);

  const handleClear = () => {
    onChangeText('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const loading = isLoading || resolving || locationLoading;
  const showClear = clearable && value.trim().length > 0 && !loading;
  const hasRightElements = showClear || loading || showLocationButton;

  const handleSelect = async (s: AddressResult) => {
    const placeId = s.place_id;
    if (!placeId) return;
    setResolving(true);
    try {
      const details = await getPlaceDetails(placeId);
      if (!details) return;
      onResolved({
        address: details.address || s.display_name,
        lat: details.lat,
        lng: details.lon,
      });
      setShowSuggestions(false);
      setSuggestions([]);
    } finally {
      setResolving(false);
    }
  };

  const inputClasses = inputClassName
    ? `input-touch ${inputClassName} ${hasRightElements ? 'pr-16' : ''}`
    : `input-touch w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 outline-none focus:border-emerald-500/55 focus:bg-white focus:ring-4 focus:ring-emerald-500/12 ${hasRightElements ? 'pr-16' : ''}`;

  const defaultListClass =
    'absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-white py-1 shadow-lg';

  const suggestionsList = showSuggestions && suggestions.length > 0 && (
    <ul
      data-roam-place-suggestions
      className={
        suggestionsListClassName ??
        `${portalSuggestions ? '' : defaultListClass} overflow-y-auto rounded-2xl border py-1 shadow-lg`
      }
      style={portalSuggestions ? portalListStyle : undefined}
      role="listbox"
    >
      {suggestions.map((suggestion, index) => (
        <li key={suggestion.place_id || `${index}-${suggestion.display_name}`} role="option">
          <button
            type="button"
            disabled={!suggestion.place_id || resolving}
            className={
              suggestionButtonClassName ??
              'flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-emerald-50 disabled:opacity-50'
            }
            onClick={() => void handleSelect(suggestion)}
          >
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span className="leading-snug">{suggestion.display_name}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={hideLabel ? 'block' : 'block space-y-2'}>
      {!hideLabel ? (
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      ) : null}
      <div className="relative" ref={wrapperRef}>
        <input
          ref={inputRef}
          className={inputClasses}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showSuggestions && suggestions.length > 0}
          onChange={(e) => {
            onChangeText(e.target.value);
            performSearch(e.target.value);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
            requestAnimationFrame(() => {
              inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            });
          }}
        />
        {hasRightElements && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {loading ? (
              <div className="pointer-events-none p-1 text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              </div>
            ) : (
              <>
                {showClear && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 touch-manipulation"
                    aria-label="Clear address"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {showLocationButton && onLocationClick && (
                  <button
                    type="button"
                    onClick={onLocationClick}
                    disabled={locationLoading}
                    className="rounded-full p-1.5 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 touch-manipulation disabled:opacity-50"
                    aria-label="Use my location"
                  >
                    <Navigation className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {suggestionsList &&
          (portalSuggestions
            ? createPortal(suggestionsList, document.body)
            : suggestionsList)}
      </div>
    </div>
  );
}
