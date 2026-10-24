import React, { useEffect, useMemo, useState } from 'react';
import {
  buildLocationKey,
  selectionFromLocationKey,
  type JamaicaCountySlug,
  type JamaicaLocationSelection,
  type LocationScope,
} from '@roam/business-config';
import { getSupabaseFunctionsBaseUrl } from '@roam/api-client';
import { supabaseRidesAdmin as supabase } from '@roam/auth-client';

export type JamaicaLocationValue = JamaicaLocationSelection;

type Locality = { slug: string; label: string };
type Parish = { slug: string; label: string; localities: Locality[] };
type County = { slug: JamaicaCountySlug; label: string; parishes: Parish[] };

type Props = {
  value: JamaicaLocationValue;
  onChange: (value: JamaicaLocationValue) => void;
};

const SCOPES: { scope: LocationScope; label: string }[] = [
  { scope: 'country', label: 'All Jamaica' },
  { scope: 'county', label: 'Whole county' },
  { scope: 'parish', label: 'Whole parish' },
  { scope: 'locality', label: 'Specific town / area' },
];

export function JamaicaLocationPicker({ value, onChange }: Props) {
  const [counties, setCounties] = useState<County[]>([]);
  const county = useMemo(
    () => counties.find((c) => c.slug === value.county),
    [counties, value.county],
  );
  const parish = useMemo(
    () => county?.parishes.find((p) => p.slug === value.parish),
    [county, value.parish],
  );
  const previewKey = buildLocationKey(value);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch(`${getSupabaseFunctionsBaseUrl()}/platform-catalog/geo/fare-tree`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      if (!cancelled) setCounties(Array.isArray(body.counties) ? body.counties : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setScope = (scope: LocationScope) => {
    if (scope === 'country') {
      onChange({ scope: 'country' });
      return;
    }
    const c = value.county ?? counties[0]?.slug ?? 'cornwall';
    const countyData = counties.find((x) => x.slug === c);
    if (scope === 'county') {
      onChange({ scope: 'county', county: c });
      return;
    }
    const parishSlug = value.parish ?? countyData?.parishes[0]?.slug;
    if (scope === 'parish') {
      onChange({ scope: 'parish', county: c, parish: parishSlug });
      return;
    }
    const parishData = countyData?.parishes.find((x) => x.slug === parishSlug);
    onChange({
      scope: 'locality',
      county: c,
      parish: parishSlug,
      locality: value.locality ?? parishData?.localities[0]?.slug,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Location</p>
      <div className="grid grid-cols-2 gap-2">
        {SCOPES.map(({ scope, label }) => (
          <button
            key={scope}
            type="button"
            onClick={() => setScope(scope)}
            className={`rounded-lg px-2 py-2 text-left text-xs border transition-colors ${
              value.scope === scope
                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                : 'border-slate-600 text-slate-400 hover:border-slate-500'
            }`}
          >
            <span className="font-medium block">{label}</span>
          </button>
        ))}
      </div>

      {value.scope !== 'country' && (
        <div className="space-y-2">
          <label className="block text-sm text-slate-300">County</label>
          <select
            value={value.county ?? ''}
            onChange={(e) => {
              const countySlug = e.target.value as JamaicaCountySlug;
              const countyData = counties.find((c) => c.slug === countySlug);
              onChange({
                scope: value.scope,
                county: countySlug,
                parish: value.scope !== 'county' ? countyData?.parishes[0]?.slug : undefined,
                locality: value.scope === 'locality' ? countyData?.parishes[0]?.localities[0]?.slug : undefined,
              });
            }}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
          >
            {counties.map((c) => (
              <option key={c.slug} value={c.slug}>{c.label}</option>
            ))}
          </select>
        </div>
      )}

      {(value.scope === 'parish' || value.scope === 'locality') && county && (
        <div className="space-y-2">
          <label className="block text-sm text-slate-300">Parish</label>
          <select
            value={value.parish ?? ''}
            onChange={(e) => {
              const parishSlug = e.target.value;
              const parishData = county.parishes.find((p) => p.slug === parishSlug);
              onChange({
                scope: value.scope,
                county: value.county,
                parish: parishSlug,
                locality: value.scope === 'locality' ? parishData?.localities[0]?.slug : undefined,
              });
            }}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
          >
            {county.parishes.map((p) => (
              <option key={p.slug} value={p.slug}>{p.label}</option>
            ))}
          </select>
        </div>
      )}

      {value.scope === 'locality' && parish && (
        <div className="space-y-2">
          <label className="block text-sm text-slate-300">Town / area</label>
          <select
            value={value.locality ?? ''}
            onChange={(e) => onChange({ ...value, locality: e.target.value })}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
          >
            {parish.localities.map((loc) => (
              <option key={loc.slug} value={loc.slug}>{loc.label}</option>
            ))}
          </select>
        </div>
      )}

      <p className="text-[11px] text-slate-500 font-mono break-all">{previewKey}</p>
    </div>
  );
}

export function locationValueFromRule(rule: {
  location_key?: string;
  city?: string;
  county?: string | null;
  parish?: string | null;
  locality?: string | null;
}): JamaicaLocationValue {
  const key = rule.location_key ?? rule.city ?? 'jamaica';
  if (rule.county || rule.parish || rule.locality) {
    const scope: LocationScope = rule.locality
      ? 'locality'
      : rule.parish
        ? 'parish'
        : rule.county
          ? 'county'
          : 'country';
    return {
      scope,
      county: (rule.county ?? undefined) as JamaicaCountySlug | undefined,
      parish: rule.parish ?? undefined,
      locality: rule.locality ?? undefined,
    };
  }
  return selectionFromLocationKey(key);
}
