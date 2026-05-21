import React, { useMemo } from 'react';
import {
  CARIBBEAN_COUNTRIES,
  JAMAICA_MARKET_SLUG,
  currencyForMarket,
  getCaribbeanCountry,
} from '@roam/business-config';

type Props = {
  countrySlug: string;
  currencyCode: string;
  onCountryChange: (slug: string, currencyCode: string) => void;
};

const selectClass =
  'w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50';

export function CaribbeanCountryCurrencyPicker({
  countrySlug,
  currencyCode,
  onCountryChange,
}: Props) {
  const country = getCaribbeanCountry(countrySlug);
  const currencyOptions = useMemo(() => {
    const code = currencyForMarket(countrySlug);
    const c = getCaribbeanCountry(countrySlug);
    return [{ code, label: c?.currencyLabel ?? code }];
  }, [countrySlug]);

  return (
    <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Country / territory</p>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-300">Market</label>
        <select
          value={countrySlug}
          onChange={(e) => {
            const slug = e.target.value;
            onCountryChange(slug, currencyForMarket(slug));
          }}
          className={selectClass}
        >
          {CARIBBEAN_COUNTRIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-300">Currency</label>
        <select
          value={currencyCode}
          disabled
          aria-readonly
          title="Set automatically from the selected market"
          className={`${selectClass} cursor-not-allowed opacity-90`}
        >
          {currencyOptions.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.code} — {opt.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-slate-500">
          Official currency for {country?.label ?? 'this market'}. Changes when you change the market
          {countrySlug === JAMAICA_MARKET_SLUG ? '; use location below for parish/town rules.' : '.'}
        </p>
      </div>
    </div>
  );
}
