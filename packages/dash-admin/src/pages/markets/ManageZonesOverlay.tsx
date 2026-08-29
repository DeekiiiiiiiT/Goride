/**
 * Overlay to pick a town border, service area, or non-delivery zone, then edit / delete.
 */
import React from 'react';
import { Map as MapIcon, MapPin, Plus, Trash2, X } from 'lucide-react';
import type { DashZoneRow } from '@roam/dash-admin-client';

type ManageZonesOverlayProps = {
  open: boolean;
  townName: string;
  delivery: DashZoneRow | null;
  serviceAreas: DashZoneRow[];
  excludes: DashZoneRow[];
  onClose: () => void;
  onEditTownOnMap: () => void;
  onEditTownCoordinates: () => void;
  onDeleteTownBorder: (zone: DashZoneRow) => void;
  onEditServiceOnMap: (zone: DashZoneRow) => void;
  onDeleteService: (zone: DashZoneRow) => void;
  onAddServiceArea: () => void;
  onEditExcludeOnMap: (zone: DashZoneRow) => void;
  onEditExcludeCoordinates: (zone: DashZoneRow) => void;
  onDeleteExclude: (zone: DashZoneRow) => void;
};

export function ManageZonesOverlay({
  open,
  townName,
  delivery,
  serviceAreas,
  excludes,
  onClose,
  onEditTownOnMap,
  onEditTownCoordinates,
  onDeleteTownBorder,
  onEditServiceOnMap,
  onDeleteService,
  onAddServiceArea,
  onEditExcludeOnMap,
  onEditExcludeCoordinates,
  onDeleteExclude,
}: ManageZonesOverlayProps) {
  if (!open) return null;

  const hasServiceAreas = serviceAreas.length > 0;

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
              {hasServiceAreas
                ? 'Service areas control live delivery. Official border is map context only.'
                : 'Edit or delete the green town border. Non-delivery zones are listed below.'}
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
              {hasServiceAreas ? 'Official town border (context)' : 'Town border (foundation)'}
            </p>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 space-y-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-100 truncate">
                  {delivery?.name ?? 'Town border'}
                </p>
                <p className="text-[11px] text-emerald-200/70">
                  {delivery
                    ? `${delivery.polygon.length} points${hasServiceAreas ? ' · not live for customers' : ''}`
                    : 'No border set — import GeoJSON or draw one on the map'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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
                <button
                  type="button"
                  disabled={!delivery}
                  onClick={() => delivery && onDeleteTownBorder(delivery)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/40 text-red-200 text-xs font-semibold disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete border
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                Service areas ({serviceAreas.length})
              </p>
              <button
                type="button"
                onClick={onAddServiceArea}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/40 text-[11px] text-emerald-200"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
            {serviceAreas.length === 0 ? (
              <p className="text-xs text-slate-500 rounded-lg border border-slate-800 px-3 py-4 text-center">
                None yet. Add a service area to deliver only in pockets — the full town border becomes
                context.
              </p>
            ) : (
              <ul className="space-y-2">
                {serviceAreas.map((z) => (
                  <li
                    key={z.id}
                    className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/15 px-3 py-2.5 space-y-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fuchsia-50 truncate">{z.name}</p>
                      <p className="text-[11px] text-fuchsia-200/70">
                        Live delivery · {z.polygon.length} points
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onEditServiceOnMap(z)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-fuchsia-500 text-slate-950 text-xs font-semibold"
                      >
                        <MapIcon className="w-3.5 h-3.5" />
                        Edit on map
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteService(z)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-red-200 text-xs font-semibold"
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
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-red-200 text-xs font-semibold"
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
