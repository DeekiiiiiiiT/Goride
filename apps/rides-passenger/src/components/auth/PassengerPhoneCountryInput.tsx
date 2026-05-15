import React from 'react';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@roam/ui';
import { ScrollArea } from '@roam/ui';
import { ChevronDown } from 'lucide-react';
import { PHONE_COUNTRIES, flagEmoji, type PhoneCountry } from '../../utils/phoneCountries';

export interface PassengerPhoneCountryInputProps {
  /** When false, no visible label (screen-reader text only). */
  showLabel?: boolean;
  label?: string;
  selectedCountry: PhoneCountry;
  onSelectCountry: (c: PhoneCountry) => void;
  onMarkManualCountry?: () => void;
  nationalDigits: string;
  onNationalDigitsChange: (digits: string) => void;
  countryMenuOpen: boolean;
  onCountryMenuOpenChange: (open: boolean) => void;
  countryFilter: string;
  onCountryFilterChange: (filter: string) => void;
}

export function PassengerPhoneCountryInput({
  showLabel = false,
  label = 'Phone number',
  selectedCountry,
  onSelectCountry,
  onMarkManualCountry,
  nationalDigits,
  onNationalDigitsChange,
  countryMenuOpen,
  onCountryMenuOpenChange,
  countryFilter,
  onCountryFilterChange,
}: PassengerPhoneCountryInputProps) {
  return (
    <div>
      {showLabel ? (
        <Label className="text-white">{label}</Label>
      ) : (
        <span className="sr-only">{label}</span>
      )}
      <div className={showLabel ? 'mt-2 flex gap-2' : 'mt-0 flex gap-2'}>
        <Popover open={countryMenuOpen} onOpenChange={onCountryMenuOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/50 bg-white px-2.5 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
              aria-label={`Country: ${selectedCountry.name}, +${selectedCountry.dial}`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {flagEmoji(selectedCountry.iso2)}
              </span>
              <span>+{selectedCountry.dial}</span>
              <ChevronDown className="h-4 w-4 text-zinc-500" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(100vw-2rem,20rem)] p-0" align="start">
            <div className="border-b border-zinc-200 p-2">
              <Input
                placeholder="Search country…"
                value={countryFilter}
                onChange={e => onCountryFilterChange(e.target.value)}
                className="h-9"
              />
            </div>
            <ScrollArea className="h-72">
              <ul className="p-1">
                {PHONE_COUNTRIES.filter(c => {
                  const q = countryFilter.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    c.name.toLowerCase().includes(q) ||
                    c.iso2.toLowerCase().includes(q) ||
                    `+${c.dial}`.includes(q) ||
                    c.dial.includes(q.replace(/\D/g, ''))
                  );
                }).map(c => (
                  <li key={c.iso2}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-zinc-100"
                      onClick={() => {
                        onMarkManualCountry?.();
                        onSelectCountry(c);
                        onCountryMenuOpenChange(false);
                        onCountryFilterChange('');
                      }}
                    >
                      <span className="text-lg leading-none">{flagEmoji(c.iso2)}</span>
                      <span className="flex-1 truncate font-medium text-zinc-800">{c.name}</span>
                      <span className="shrink-0 text-zinc-500">+{c.dial}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </PopoverContent>
        </Popover>
        <Input
          inputMode="numeric"
          autoComplete="tel-national"
          value={nationalDigits}
          onChange={e =>
            onNationalDigitsChange(e.target.value.replace(/\D/g, '').slice(0, selectedCountry.nationalMaxLen))
          }
          placeholder={selectedCountry.placeholder}
          className="input-touch min-w-0 flex-1 rounded-xl border border-white/50 bg-white text-zinc-900"
          maxLength={selectedCountry.nationalMaxLen}
        />
      </div>
      <p className="mt-1 text-xs text-white/65">
        {selectedCountry.name} · +{selectedCountry.dial} ·{' '}
        {selectedCountry.nationalMinLen === selectedCountry.nationalMaxLen
          ? `${selectedCountry.nationalMinLen} digits`
          : `${selectedCountry.nationalMinLen}–${selectedCountry.nationalMaxLen} digits`}
      </p>
    </div>
  );
}
