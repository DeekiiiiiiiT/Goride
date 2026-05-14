import React from 'react';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@roam/ui';
import { ScrollArea } from '@roam/ui';
import { ChevronDown } from 'lucide-react';
import { PHONE_COUNTRIES, flagEmoji, type PhoneCountry } from '../../utils/phoneCountries';

export interface DriverPhoneCountryInputProps {
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

export function DriverPhoneCountryInput({
  label = 'Mobile number',
  selectedCountry,
  onSelectCountry,
  onMarkManualCountry,
  nationalDigits,
  onNationalDigitsChange,
  countryMenuOpen,
  onCountryMenuOpenChange,
  countryFilter,
  onCountryFilterChange,
}: DriverPhoneCountryInputProps) {
  return (
    <div>
      <Label className="text-slate-800 dark:text-slate-200">{label}</Label>
      <div className="mt-2 flex gap-2">
        <Popover open={countryMenuOpen} onOpenChange={onCountryMenuOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100 dark:hover:bg-slate-800/80"
              aria-label="Select country code"
            >
              <span className="text-lg leading-none" aria-hidden>
                {flagEmoji(selectedCountry.iso2)}
              </span>
              <span>+{selectedCountry.dial}</span>
              <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(100vw-2rem,20rem)] p-0" align="start">
            <div className="border-b border-slate-200 p-2 dark:border-slate-700">
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
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => {
                        onMarkManualCountry?.();
                        onSelectCountry(c);
                        onCountryMenuOpenChange(false);
                        onCountryFilterChange('');
                      }}
                    >
                      <span className="text-lg leading-none">{flagEmoji(c.iso2)}</span>
                      <span className="flex-1 truncate font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                      <span className="shrink-0 text-slate-500 dark:text-slate-400">+{c.dial}</span>
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
          className="min-w-0 flex-1"
          maxLength={selectedCountry.nationalMaxLen}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {selectedCountry.name} · +{selectedCountry.dial} ·{' '}
        {selectedCountry.nationalMinLen === selectedCountry.nationalMaxLen
          ? `${selectedCountry.nationalMinLen} digits`
          : `${selectedCountry.nationalMinLen}–${selectedCountry.nationalMaxLen} digits`}
      </p>
    </div>
  );
}
