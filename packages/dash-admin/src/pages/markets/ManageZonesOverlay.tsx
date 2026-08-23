/**
 * Overlay to pick a town border or non-delivery zone, then edit on map / coordinates or delete.
 */
import React from 'react';
import { Map as MapIcon, MapPin, Trash2, X } from 'lucide-react';
import type { DashZoneRow } from '@roam/dash-admin-client';

type ManageZonesOverlayProps = {
  open: boolean;
  townName: string;
  delivery: DashZoneRow | null;
  excludes: DashZoneRow[];
  onClose: () => void;
  onEditTownOnMap: () => void;
  onEditTownCoordinates: () => void;
  onEditExcludeOnMap: (zone: DashZoneRow) => void;
  onEditExcludeCoordinates: (zone: DashZoneRow) => void;
  onDeleteExclude: (zone: DashZoneRow) => void;
};

export function ManageZonesOverlay({
  open,
  townName,
  delivery,
  excludes,
  onClose,
  onEditTownOnMap,
  onEditTownCoordinates,
  onEditExcludeOnMap,
  onEditExcludeCoordinates,
  onDeleteExclude,
}: ManageZonesOverlayProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-zones-title"
        className="relative w-full max-w-lg max-h-[88vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h2 id="manage-zones-title" className="text-base font-semibold text-white">
              Manage zones · {townName}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Edit the green town border on the map, or type coordinates. Non-delivery zones are
              listed below.
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
          <section className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
              Town border (foundation)
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-100 truncate">
                  {delivery?.name ?? 'Town border'}
                </p>
                <p className="text-[11px] text-emerald-200/70">
                  {delivery ? `${delivery.polygon.length} points` : 'Missing — reload to restore'}
                </p>
              </div>
              <button
                type="button"
                disabled={!delivery}
                onClick={onEditTownOnMap}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold disabled:opacity-40"
              >
                <MapIcon className="w-3.5 h-3.5" />
                Edit on map
              </button>
              <button
                type="button"
                disabled={!delivery}
                onClick={onEditTownCoordinates}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/40 text-emerald-100 text-xs font-semibold disabled:opacity-40"
              >
                <MapPin className="w-3.5 h-3.5" />
                Coordinates
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
              Non-delivery zones ({excludes.length})
            </p>
            {excludes.length === 0 ? (
              <p className="text-xs text-slate-500 rounded-lg border border-slate-800 px-3 py-4 text-center">
                None yet. Close this and use “Don’t deliver near here” or “Draw non-delivery zone”.
              </p>
            ) : (
              <ul className="space-y-2">
                {excludes.map((z) => (
                  <li
                    key={z.id}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 shrink-0">
                        {z.source === 'radius' ? 'Radius' : 'Shape'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-50 truncate">{z.name}</p>
                        <p className="text-[11px] text-red-200/70">
                          {z.source === 'radius' && z.radius_m
                            ? `${Math.round(z.radius_m)}m radius · ${z.polygon.length} pts`
                            : `${z.polygon.length} points`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onEditExcludeOnMap(z)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-semibold"
                      >
                        <MapIcon className="w-3.5 h-3.5" />
                        Edit on map
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditExcludeCoordinates(z)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-400/40 text-red-100 text-xs font-semibold"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        Coordinates
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteExclude(z)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-300 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
