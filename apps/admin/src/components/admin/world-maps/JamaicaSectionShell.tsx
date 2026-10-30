// Stitch: dominion-redesign/dfbd91b2308242d0bbbd33b83de0389e
import { useEffect, useState, type ReactNode } from 'react';
import { fetchSummary, type MapSummary } from './jamaica-map/jamaicaMapApi';
import { formatShortWhen, formatWhen } from './jamaica-map/jamaicaMapFormat';
import { MapLevelTabs } from './MapLevelTabs';
import './jamaica-map/jamaicaMap.css';

export function JamaicaSectionShell({
  page,
  accessToken,
  onNavigate,
  children,
}: {
  page: string;
  accessToken: string;
  onNavigate: (pageId: string) => void;
  children: (summary: MapSummary | null, error: string | null) => ReactNode;
}) {
  const [summary, setSummary] = useState<MapSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchSummary(accessToken)
      .then((body) => {
        if (!cancelled) setSummary(body);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the map. Nothing was changed.');
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, tick]);

  const updated = formatWhen(summary?.last_publish_at);

  function openDrafts() {
    const url = new URL(window.location.href);
    url.searchParams.set('drafts', '1');
    window.history.replaceState({ page: 'world-parishes' }, '', `${url.pathname}?${url.searchParams.toString()}`);
    onNavigate('world-parishes');
  }

  return (
    <div className="jamaica-map flex flex-col w-full bg-surface text-on-surface">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-2 text-xs font-mono text-outline">
          <span>Dominion</span>
          <span>›</span>
          <span>Master data</span>
          <span>›</span>
          <span>Places and Maps</span>
          <span>›</span>
          <span className="text-on-surface font-medium">Jamaica map</span>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-headline font-bold text-on-surface tracking-tight">Jamaica map</h1>
            <p className="text-xs text-on-surface-variant mt-0.5">The official map of Jamaica, from the country down to communities.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-label font-semibold bg-tertiary-container text-on-tertiary-container shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
              Published
            </span>
            <span className="text-xs font-mono text-on-surface-variant bg-surface-container px-2.5 py-1 rounded">
              {updated === '—' ? 'Updated —' : `Updated ${updated}`}
            </span>
          </div>
        </div>
      </div>

      <MapLevelTabs page={page} onNavigate={onNavigate} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <Kpi label="Parishes" value={summary?.parishes} />
        <Kpi label="Towns" value={summary?.towns} tone="text-secondary" />
        <Kpi label="Communities" value={summary?.communities} />
        <button type="button" className="text-left" onClick={openDrafts}>
          <Kpi label="Drafts" value={summary?.drafts} />
        </button>
        <Kpi label="Quality issues" value={summary?.quality_issues} tone="text-tertiary" />
        <Kpi label="Last change" value={formatShortWhen(summary?.last_publish_at)} text />
      </div>

      {error ? (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-bold text-on-surface">Could not load the map. Nothing was changed.</h3>
          <button type="button" className="mt-3 px-3 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-semibold" onClick={() => { setError(null); setTick((n) => n + 1); }}>
            Retry
          </button>
        </div>
      ) : null}

      {children(summary, error)}
    </div>
  );
}

function Kpi({ label, value, tone = 'text-on-surface', text }: { label: string; value: number | string | null | undefined; tone?: string; text?: boolean }) {
  const shown = value == null || value === '' ? '—' : value;
  return (
    <div className="bg-surface-container-lowest p-3.5 rounded-xl shadow-sm flex flex-col justify-between">
      <span className="text-[11px] font-label uppercase tracking-wider text-outline">{label}</span>
      <span className={text ? 'text-xs font-mono font-medium text-on-surface mt-2.5' : `text-xl font-headline font-bold mt-1 ${tone}`}>{shown}</span>
    </div>
  );
}
