/**
 * Ops overlay: name each border corner (edge + landmark) and type lat/lng.
 */
import React, { useEffect, useState } from 'react';
import { Check, Plus, Square, Trash2, X } from 'lucide-react';
import type { DashZoneVertex } from '../../services/dashAdminService';
import { orderRingClockwise, rectangleFromExtremes } from './coverageGeo';

export type NamedBorderPoint = {
  id: string;
  edgePoint: string;
  boundaryRef: string;
  lat: number;
  lng: number;
};

type DraftRow = {
  id: string;
  edgePoint: string;
  boundaryRef: string;
  lat: string;
  lng: string;
};

type ApplyMode = 'around' | 'box';

type CoordinateEntryOverlayProps = {
  open: boolean;
  onClose: () => void;
  /** Current map vertices — used to seed the table when opening. */
  vertices: DashZoneVertex[];
  /** Optional labels already known for vertices (by index). */
  knownPoints?: NamedBorderPoint[];
  onApply: (points: NamedBorderPoint[]) => void;
};

function newId() {
  return `pt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyDraft(): DraftRow {
  return { id: newId(), edgePoint: '', boundaryRef: '', lat: '', lng: '' };
}

function parseLatLng(latRaw: string, lngRaw: string): { lat: number; lng: number } | null {
  const lat = Number(String(latRaw).trim());
  const lng = Number(String(lngRaw).trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function seedRows(vertices: DashZoneVertex[], known?: NamedBorderPoint[]): DraftRow[] {
  if (known && known.length > 0) {
    return known.map((p) => ({
      id: p.id,
      edgePoint: p.edgePoint,
      boundaryRef: p.boundaryRef,
      lat: String(p.lat),
      lng: String(p.lng),
    }));
  }
  if (vertices.length === 0) return [emptyDraft()];
  return vertices.map((v) => ({
    id: newId(),
    edgePoint: '',
    boundaryRef: '',
    lat: v.lat.toFixed(5),
    lng: v.lng.toFixed(5),
  }));
}

function collectValidPoints(rows: DraftRow[]): NamedBorderPoint[] {
  const points: NamedBorderPoint[] = [];
  for (const r of rows) {
    const parsed = parseLatLng(r.lat, r.lng);
    if (!parsed) continue;
    points.push({
      id: r.id,
      edgePoint: r.edgePoint.trim(),
      boundaryRef: r.boundaryRef.trim(),
      lat: parsed.lat,
      lng: parsed.lng,
    });
  }
  return points;
}

function boxNamedPoints(source: NamedBorderPoint[]): NamedBorderPoint[] {
  const ring = rectangleFromExtremes(source);
  const labels = [
    { edgePoint: 'Northwest corner', boundaryRef: 'Outer north + west limits' },
    { edgePoint: 'Northeast corner', boundaryRef: 'Outer north + east limits' },
    { edgePoint: 'Southeast corner', boundaryRef: 'Outer south + east limits' },
    { edgePoint: 'Southwest corner', boundaryRef: 'Outer south + west limits' },
  ];
  return ring.map((v, i) => ({
    id: newId(),
    edgePoint: labels[i].edgePoint,
    boundaryRef: labels[i].boundaryRef,
    lat: v.lat,
    lng: v.lng,
  }));
}

export function CoordinateEntryOverlay({
  open,
  onClose,
  vertices,
  knownPoints,
  onApply,
}: CoordinateEntryOverlayProps) {
  const [rows, setRows] = useState<DraftRow[]>(() => seedRows(vertices, knownPoints));
  const [draft, setDraft] = useState<DraftRow>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(seedRows(vertices, knownPoints));
    setDraft(emptyDraft());
    setError(null);
    // Seed only when the overlay opens — don't reset while the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const updateRow = (id: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  const addFromDraft = () => {
    setError(null);
    const parsed = parseLatLng(draft.lat, draft.lng);
    if (!parsed) {
      setError('Enter valid latitude (−90 to 90) and longitude (−180 to 180).');
      return;
    }
    if (!draft.edgePoint.trim()) {
      setError('Name the edge point (e.g. North Limit).');
      return;
    }
    setRows((prev) => [
      ...prev.filter((r) => r.lat.trim() || r.lng.trim() || r.edgePoint.trim()),
      {
        ...draft,
        lat: String(parsed.lat),
        lng: String(parsed.lng),
      },
    ]);
    setDraft(emptyDraft());
  };

  const handleApply = (mode: ApplyMode) => {
    setError(null);
    const points = collectValidPoints(rows);
    if (points.length < 3) {
      setError(`Need at least 3 valid points with lat/lng (found ${points.length}).`);
      return;
    }
    if (mode === 'box') {
      onApply(boxNamedPoints(points));
      onClose();
      return;
    }
    // Walk around the town edge — ignores the order you typed them in.
    onApply(orderRingClockwise(points));
    onClose();
  };

  const validCount = rows.filter((r) => parseLatLng(r.lat, r.lng)).length;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coord-overlay-title"
        className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h2 id="coord-overlay-title" className="text-base font-semibold text-white">
              Enter coordinates
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              North / South / East / West limits are <span className="text-slate-200">not</span> drawn
              in that list order — that makes a bow-tie. Use{' '}
              <span className="text-amber-300">Apply as outer box</span> for a proper rectangle, or
              we’ll auto-sort corners around the town edge.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
              Add edge point
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  Edge point
                </label>
                <input
                  value={draft.edgePoint}
                  onChange={(e) => setDraft((d) => ({ ...d, edgePoint: e.target.value }))}
                  placeholder="e.g. North Limit"
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  Boundary location reference
                </label>
                <input
                  value={draft.boundaryRef}
                  onChange={(e) => setDraft((d) => ({ ...d, boundaryRef: e.target.value }))}
                  placeholder="e.g. Bog Walk Gorge approach / Angel's"
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  Latitude
                </label>
                <input
                  value={draft.lat}
                  onChange={(e) => setDraft((d) => ({ ...d, lat: e.target.value }))}
                  placeholder="18.0425"
                  inputMode="decimal"
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  Longitude
                </label>
                <input
                  value={draft.lng}
                  onChange={(e) => setDraft((d) => ({ ...d, lng: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addFromDraft();
                    }
                  }}
                  placeholder="-76.9592"
                  inputMode="decimal"
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white font-mono"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={addFromDraft}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/40 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10"
            >
              <Plus className="w-3.5 h-3.5" />
              Add to list
            </button>
          </div>

          <div className="rounded-lg border border-slate-700 overflow-hidden">
            <div className="hidden sm:grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_40px] gap-2 px-3 py-2 bg-slate-950/80 border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
              <span>Edge point</span>
              <span>Boundary location reference</span>
              <span>Latitude / Longitude</span>
              <span />
            </div>
            <ul className="divide-y divide-slate-800 max-h-[40vh] overflow-y-auto">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_40px] gap-2 px-3 py-2.5 items-start sm:items-center bg-slate-900/40"
                >
                  <div>
                    <span className="sm:hidden block text-[10px] uppercase text-slate-500 mb-1">
                      Edge point
                    </span>
                    <input
                      value={r.edgePoint}
                      onChange={(e) => updateRow(r.id, { edgePoint: e.target.value })}
                      placeholder="Edge point"
                      className="w-full px-2 py-1.5 rounded-md bg-slate-950 border border-slate-700 text-sm text-white font-medium"
                    />
                  </div>
                  <div>
                    <span className="sm:hidden block text-[10px] uppercase text-slate-500 mb-1">
                      Boundary reference
                    </span>
                    <input
                      value={r.boundaryRef}
                      onChange={(e) => updateRow(r.id, { boundaryRef: e.target.value })}
                      placeholder="Landmark / road"
                      className="w-full px-2 py-1.5 rounded-md bg-slate-950 border border-slate-700 text-sm text-slate-200"
                    />
                  </div>
                  <div>
                    <span className="sm:hidden block text-[10px] uppercase text-slate-500 mb-1">
                      Lat / Lng
                    </span>
                    <div className="flex items-center gap-1.5 rounded-md bg-slate-950 border border-slate-700 px-2 py-1.5">
                      <input
                        value={r.lat}
                        onChange={(e) => updateRow(r.id, { lat: e.target.value })}
                        placeholder="lat"
                        inputMode="decimal"
                        className="w-full min-w-0 bg-transparent text-sm text-slate-100 font-mono outline-none"
                      />
                      <span className="text-slate-600 shrink-0">,</span>
                      <input
                        value={r.lng}
                        onChange={(e) => updateRow(r.id, { lng: e.target.value })}
                        placeholder="lng"
                        inputMode="decimal"
                        className="w-full min-w-0 bg-transparent text-sm text-slate-100 font-mono outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    className="justify-self-end sm:justify-self-center p-1.5 text-red-400 hover:bg-slate-800 rounded"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
              {rows.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-slate-500">
                  No points yet — add an edge above.
                </li>
              )}
            </ul>
          </div>

          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800 px-4 py-3 bg-slate-950/50">
          <p className="text-xs text-slate-500">{validCount} valid points</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleApply('around')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-600 text-xs text-slate-200"
            >
              <Check className="w-3.5 h-3.5" />
              Apply around edge
            </button>
            <button
              type="button"
              onClick={() => handleApply('box')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold"
            >
              <Square className="w-3.5 h-3.5" />
              Apply as outer box
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
