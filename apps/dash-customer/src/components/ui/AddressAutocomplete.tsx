import { useEffect, useRef, useState } from 'react';
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
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (next: string) => {
    onChange(next);
    const results = searchAddressSuggestions(next);
    setSuggestions(results);
    setOpen(results.length > 0);
  };

  const handleSelect = (suggestion: AddressSuggestion) => {
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
            const results = searchAddressSuggestions(value);
            setSuggestions(results);
            setOpen(results.length > 0);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full h-[52px] pl-12 pr-4 bg-surface-container border-none rounded-lg text-base text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary transition-all input-touch"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-surface-container-lowest rounded-xl shadow-[0px_10px_30px_rgba(0,0,0,0.12)] border border-surface-variant overflow-hidden z-50 max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
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
    </div>
  );
}
