// Stitch: dominion-redesign/7b43269438a14b948cbbba113e6f4e42
import { useState } from 'react';
import type { AreaDetail, MapSummary, ParishRow } from './jamaicaMapApi';
import { editorPageForLevel, formatCentre, formatKm, formatPoints, formatWhen, levelLabel, sourceLabel } from './jamaicaMapFormat';

const STITCH_SELECTED_EXAMPLE = 'Half Way Tree';

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ''}`}>{name}</span>;
}

export function AreaInspector({
  summary,
  area,
  loading,
  canWrite,
  onSelect,
  onHover,
  onNavigate,
}: {
  summary: MapSummary | null;
  area: AreaDetail | null;
  loading: boolean;
  canWrite: boolean;
  onSelect: (pcode: string | null) => void;
  onHover: (pcode: string | null) => void;
  onNavigate: (pageId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!area) {
    const parishes = summary?.parishes_list ?? [];
    return (
      <div className="lg:col-span-4 bg-surface-container-lowest rounded-2xl shadow-sm p-5 flex flex-col justify-between h-[340px] sm:h-[520px] lg:h-full overflow-hidden max-md:fixed max-md:bottom-0 max-md:inset-x-0 max-md:z-30 max-md:rounded-t-2xl">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-headline text-on-surface">Jamaica</h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-surface-container text-on-surface">JM</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary-container text-on-secondary-container uppercase tracking-wider">Country</span>
          </div>
          <span className="text-xs text-on-surface-variant">National Boundary Grid</span>
          <div className="grid grid-cols-3 gap-2 bg-surface-container-low p-2.5 rounded-xl text-center">
            <Stat value={summary?.parishes ?? '—'} label="Parishes" />
            <Stat value={summary?.towns ?? '—'} label="Towns" />
            <Stat value={summary?.communities ?? '—'} label="Communities" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold text-on-surface uppercase tracking-wider font-label">Parishes ({parishes.length || summary?.parishes || 0})</span>
            <span className="text-[11px] font-mono text-outline">COD-AB Grid</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 my-2 space-y-1">
          {parishes.map((row) => (
            <ParishLine key={row.pcode} row={row} onSelect={onSelect} onHover={onHover} />
          ))}
        </div>
        <div className="pt-3 bg-surface-container-low -mx-5 -mb-5 px-5 py-3 text-center">
          <p className="text-xs text-on-surface-variant font-body">Click an area on the map or search to see its details.</p>
        </div>
      </div>
    );
  }

  const place = area.place;
  const metrics = area.metrics;
  const childLevel = place.admin_level === 1 ? 'Towns' : 'Communities';
  const code = place.pcode;

  function openEditor() {
    const pageId = editorPageForLevel(place.admin_level);
    const url = new URL(window.location.href);
    url.searchParams.set('page', pageId);
    url.searchParams.set('area', code);
    window.history.pushState({ page: pageId }, '', `${url.pathname}?${url.searchParams.toString()}`);
    onNavigate(pageId);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="lg:col-span-4 bg-surface-container-lowest rounded-2xl shadow-sm flex flex-col justify-between h-[340px] sm:h-[520px] lg:h-full overflow-hidden max-md:fixed max-md:bottom-0 max-md:inset-x-0 max-md:z-30 max-md:rounded-t-2xl"
      data-example={STITCH_SELECTED_EXAMPLE}
    >
      <div className="p-6 overflow-y-auto space-y-6">
        <div className="space-y-2">
          <button className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline" type="button" onClick={() => onSelect(null)}>
            <span>‹ Jamaica</span>
          </button>
          <div className="flex items-start justify-between gap-3 pt-1">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold font-headline text-on-surface tracking-tight">{place.name}</h2>
                <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-semibold">{levelLabel(place.admin_level)}</span>
              </div>
              <div className="text-xs font-mono font-medium text-secondary mt-0.5">{code}</div>
            </div>
            <button className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container transition-colors" title="Bookmark or Pin" type="button">
              <Icon name="push_pin" className="text-[18px]" />
            </button>
          </div>
          <div className="text-[11px] font-body text-on-surface-variant flex items-center gap-1 flex-wrap">
            {area.path.map((node, index) => (
              <span key={node.pcode} className="inline-flex items-center gap-1">
                {index > 0 ? <span className="text-outline-variant">›</span> : null}
                <button
                  type="button"
                  className={index === area.path.length - 1 ? 'font-semibold text-on-surface' : 'hover:text-secondary'}
                  onClick={() => onSelect(node.pcode)}
                >
                  {node.name}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-3.5 rounded-xl">
          <Fact label="Area" value={formatKm(metrics?.area_sqkm)} />
          <Fact label="Border points" value={formatPoints(metrics?.vertex_count)} />
          <Fact label="Centre" value={formatCentre(place.center_lat, place.center_lng)} />
          <Fact label={childLevel} value={String(area.children.length)} />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-label uppercase tracking-wider text-on-surface-variant font-semibold">Boundary status</div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-tertiary-container text-on-tertiary-container text-[11px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                <span>Live</span>
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-mono font-medium text-on-surface">v{metrics?.version ?? 1} · {sourceLabel(metrics?.source)}</span>
                <span className="text-[10px] text-outline font-mono">{formatWhen(metrics?.created_at)}</span>
              </div>
            </div>
            {area.older_versions > 0 ? (
              <span className="text-xs text-secondary font-medium">{area.older_versions} older versions</span>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-label uppercase tracking-wider text-on-surface-variant font-semibold">Used by</span>
            <span className="text-[10px] font-mono text-outline">Counts only</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Count icon="storefront" value={area.used_by.places} label="Dominion" />
            <Count icon="local_convenience_store" value={area.used_by.rush_markets} label="Rush" />
            <Count icon="pin_drop" value={area.used_by.pins} label="Map pins" />
          </div>
          <p className="text-[10px] text-outline font-body italic pt-0.5">Counts only. Records stay in each app.</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-label uppercase tracking-wider text-on-surface-variant font-semibold">{childLevel} in {place.name}</span>
            <span className="text-xs font-mono text-on-surface-variant">{area.children.length} total</span>
          </div>
          <div className="space-y-1">
            {area.children.map((child, index) => (
              <button
                key={child.pcode}
                type="button"
                className="w-full flex items-center justify-between p-2 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors cursor-pointer group"
                onClick={() => onSelect(child.pcode)}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${index === 0 ? 'bg-secondary' : 'bg-outline-variant'}`} />
                  <span className="text-xs font-medium text-on-surface truncate">{child.name}</span>
                  <span className="text-[10px] font-mono text-outline">{child.pcode}</span>
                </span>
                <Icon name="chevron_right" className="text-outline text-[16px]" />
              </button>
            ))}
          </div>
        </div>
        {loading ? <p className="text-xs text-on-surface-variant">Loading the map…</p> : null}
      </div>
      <div className="p-4 bg-surface-container-lowest shadow-[0_-4px_12px_rgba(0,0,0,0.03)] space-y-2">
        <div className="flex items-center gap-2">
          <button
            className="flex-1 py-2 px-3 rounded-lg bg-secondary text-on-secondary text-xs font-semibold hover:bg-secondary-dim transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            type="button"
            disabled={!canWrite}
            onClick={openEditor}
          >
            <Icon name="edit" className="text-[16px]" />
            <span>Open border editor</span>
          </button>
          <div className="relative group">
            <button className="p-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors flex items-center justify-center" title="Copy area code" type="button" onClick={() => { void copyCode(); }}>
              <Icon name="content_copy" className="text-[18px]" />
            </button>
            {copied ? (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-inverse-surface text-surface text-[10px] font-mono whitespace-nowrap shadow-md pointer-events-none">
                Copied {code}
              </div>
            ) : null}
          </div>
        </div>
        {canWrite ? null : (
          <div className="flex items-center gap-1.5 justify-center text-[10px] text-outline font-body">
            <Icon name="lock" className="text-[13px]" />
            <span>You can view this map. Only the owner can change borders.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-bold font-mono text-on-surface">{value}</span>
      <span className="text-[10px] text-on-surface-variant font-body uppercase tracking-wider">{label}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">{label}</span>
      <span className="text-xs font-mono font-semibold text-on-surface mt-0.5 truncate">{value}</span>
    </div>
  );
}

function Count({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-surface-container text-center flex flex-col items-center">
      <Icon name={icon} className="text-secondary text-[18px] mb-0.5" />
      <span className="text-xs font-mono font-bold text-on-surface">{value}</span>
      <span className="text-[10px] text-on-surface-variant leading-none mt-1">{label}</span>
    </div>
  );
}

function ParishLine({
  row,
  onSelect,
  onHover,
}: {
  row: ParishRow;
  onSelect: (pcode: string) => void;
  onHover: (pcode: string | null) => void;
}) {
  return (
    <button
      type="button"
      className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-container transition-colors cursor-pointer group"
      onMouseEnter={() => onHover(row.pcode)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(row.pcode)}
    >
      <span className="flex items-center gap-2">
        <span className="text-xs font-semibold text-on-surface group-hover:text-secondary transition-colors">{row.name}</span>
        <span className="text-[10px] font-mono text-outline">{row.pcode}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="text-[11px] font-mono text-on-surface-variant">{row.towns} towns · {row.communities} communities</span>
        <Icon name="chevron_right" className="text-[16px] text-outline group-hover:text-secondary" />
      </span>
    </button>
  );
}
