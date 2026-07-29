import { useEffect, useRef, useState } from 'react';
import { searchAddresses, getPlaceDetails } from '@roam/location';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { searchAddressSuggestions, type AddressSuggestion } from '@/lib/addressSuggestions';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  id?: string;
  className?: string;
};

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search for an address',
  id = 'address-search',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [mapsUnavailable, setMapsUnavailable] = useState(false);
  const [searching, setSearching] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSearch = async (next: string) => {
    const q = next.trim();
    if (!q) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    setSearching(true);
    try {
      const results = await searchAddresses(q);
      setMapsUnavailable(false);
      const mapped: AddressSuggestion[] = results.map((r) => ({
        id: r.placeId || r.description,
        line1: r.mainText || r.description,
        line2: undefined,
        area: r.secondaryText || 'Jamaica',
        placeId: r.placeId,
      }));
      setSuggestions(mapped);
      setOpen(mapped.length > 0);
    } catch {
      // Graceful fallback when maps key missing / geocode unavailable
      setMapsUnavailable(true);
      const fallback = searchAddressSuggestions(q);
      setSuggestions(fallback);
      setOpen(fallback.length > 0);
    } finally {
      setSearching(false);
    }
  };

  const handleChange = (next: string) => {
    onChange(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(next);
    }, 280);
  };

  const handleSelect = async (suggestion: AddressSuggestion) => {
    if (suggestion.placeId) {
      try {
        const details = await getPlaceDetails(suggestion.placeId);
        onSelect({
          id: suggestion.placeId,
          line1: details.streetAddress || details.formattedAddress.split(',')[0] || suggestion.line1,
          line2: undefined,
          area: details.city || suggestion.area,
          lat: details.lat,
          lng: details.lng,
          placeId: suggestion.placeId,
        });
        onChange(details.streetAddress || details.formattedAddress);
        setOpen(false);
        return;
      } catch {
        // fall through to plain select
      }
    }
    onSelect(suggestion);
    onChange(suggestion.line1);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <MaterialIcon
          name="search"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
        />
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (value.trim()) void runSearch(value);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full h-[52px] pl-12 pr-4 bg-surface-container border-none rounded-lg text-base text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary transition-all input-touch"
        />
      </div>
      {mapsUnavailable && (
        <p className="text-body-sm text-on-surface-variant mt-2">
          Live address search unavailable — showing Kingston suggestions. Add a maps key for full Jamaica geocode.
        </p>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-surface-container-lowest rounded-xl shadow-[0px_10px_30px_rgba(0,0,0,0.12)] border border-surface-variant overflow-hidden z-50 max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => void handleSelect(s)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-container transition-colors"
              >
                <MaterialIcon name="location_on" className="text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-body-md text-on-surface font-medium">{s.line1}</p>
                  <p className="text-body-sm text-on-surface-variant">
                    {s.line2 ? `${s.line2}, ` : ''}
                    {s.area}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && (
        <p className="text-body-sm text-on-surface-variant mt-2">Searching…</p>
      )}
    </div>
  );
}
