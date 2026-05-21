import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
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
};

export function RoamPlaceField({
  label,
  value,
  onChangeText,
  onResolved,
  placeholder,
  clearable = false,
  isLoading = false,
}: Props) {
  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [resolving, setResolving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const handleClear = () => {
    onChangeText('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const loading = isLoading || resolving;
  const showClear = clearable && value.trim().length > 0 && !loading;

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

  return (
    <div className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
        {label}
      </span>
      <div className="relative" ref={wrapperRef}>
        <input
          className={`input-touch w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 outline-none focus:border-emerald-500/55 focus:bg-white focus:ring-4 focus:ring-emerald-500/12 ${showClear || loading ? 'pr-10' : ''}`}
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
          }}
        />
        {(loading || showClear) && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
            {loading ? (
              <div className="pointer-events-none p-1 text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              </div>
            ) : (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 touch-manipulation"
                aria-label="Clear address"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        )}

        {showSuggestions && suggestions.length > 0 && (
          <ul
            className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-white py-1 shadow-lg"
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.place_id || `${index}-${suggestion.display_name}`} role="option">
                <button
                  type="button"
                  disabled={!suggestion.place_id || resolving}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-emerald-50 disabled:opacity-50"
                  onClick={() => void handleSelect(suggestion)}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <span className="leading-snug">{suggestion.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
