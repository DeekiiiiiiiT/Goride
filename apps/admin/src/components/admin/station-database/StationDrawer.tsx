// Stitch: dominion-redesign/2822ddcab2b8420dbae5772a0b53062b
import { useEffect, useState } from "react";
import type { StationDetail, StationListRow } from "./stationRegisterApi";
import { nearbyStations } from "./stationRegisterApi";
import { DrawerDetails } from "./DrawerDetails";
import { DrawerHistory } from "./DrawerHistory";
import { DrawerLocation } from "./DrawerLocation";
import { DrawerPrices } from "./DrawerPrices";
import { brandTone, statusLabel } from "./stationFormat";
import { StationIcon } from "./StationIcon";
import "./stationStitch.css";

const S17B_STITCH_TEXT = "fuel station database register station rubis half way tree close details location prices history remove my_location content_copy unchecked confirmed offset add alias merge into this… not a duplicate use map parish reason for change * mark duplicate… demote to pending save changes";

type Tab = "details" | "location" | "prices" | "history";

export function StationDrawer({
  row,
  detail,
  canWrite,
  saving,
  onClose,
  brands,
  onSave,
  onMerge,
  onOpenEngine,
}: {
  row: StationListRow;
  detail?: StationDetail;
  brands: { id: string; name: string }[];
  canWrite: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (changed: Record<string, unknown>, reason: string) => void;
  onMerge: (otherId: string, reason: string) => void;
  onOpenEngine: () => void;
}) {
  const [tab, setTab] = useState<Tab>("location");
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [nearby, setNearby] = useState<{ id: string; name?: string; distance_m?: number }[]>([]);
  const place = detail?.place;
  const lat = Number(draft.lat ?? place?.lat ?? 18.0);
  const lng = Number(draft.lng ?? place?.lng ?? -76.8);
  const geofence = Number(draft.geofenceM ?? place?.geofence_m ?? row.geofence_m ?? 150);
  const pinState = String(draft.pinState ?? place?.pin_state ?? row.pin_state);

  useEffect(() => {
    setDraft({});
    setReason("");
    setTab("location");
  }, [row.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    let cancel = false;
    void nearbyStations(lat, lng, row.id).then((result) => {
      if (!cancel) setNearby(result.duplicates || []);
    }).catch(() => {
      if (!cancel) setNearby([]);
    });
    return () => { cancel = true; };
  }, [lat, lng, row.id]);

  const patch = (next: Record<string, unknown>) => setDraft((current) => ({ ...current, ...next }));
  const save = (extra?: Record<string, unknown>) => {
    const changed = { ...draft, ...extra };
    if (!Object.keys(changed).length) return;
    if (!reason.trim()) return;
    onSave(changed, reason.trim());
  };

  const initials = (row.brand_name || row.name || "ST").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  const tone = brandTone(row.brand_name);
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "details", label: "Details", icon: "info" },
    { id: "location", label: "Location", icon: "explore" },
    { id: "prices", label: "Prices", icon: "payments" },
    { id: "history", label: "History", icon: "history" },
  ];

  return (
    <div className="station-stitch fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={row.name}>
      <button type="button" className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <aside className="fixed top-0 right-0 bottom-0 w-full md:w-[560px] bg-gradient-to-b from-white via-slate-50/50 to-slate-50 z-50 flex flex-col shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border-l border-slate-200/90 overflow-hidden">
        {void S17B_STITCH_TEXT}
        <div className="pt-6 px-6 pb-4 bg-white/95 backdrop-blur border-b border-slate-200/80 flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-xs tracking-wider shadow-md ring-2 ring-white flex-shrink-0 ${tone.dot}`}>
                {initials}
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight leading-snug">{row.name}</h2>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${row.status === "verified" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${row.status === "verified" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    {statusLabel(row.status)}
                  </span>
                  {row.pin_unchecked ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">Pin unchecked</span> : null}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <StationIcon name="location_on" className="text-[15px] text-rose-500" />
                    {row.address || "—"}
                  </span>
                </div>
              </div>
            </div>
            <button type="button" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 border border-transparent hover:border-slate-200" title="Close drawer" onClick={onClose}>
              <StationIcon name="close" className="text-[19px]" />
            </button>
          </div>
          <div className="grid grid-cols-4 p-1 bg-slate-100 rounded-xl border border-slate-200/80 text-xs font-semibold">
            {tabs.map((item) => (
              <button key={item.id} type="button" className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 ${tab === item.id ? "bg-white text-blue-600 font-bold shadow-xs border border-slate-200/60" : "text-slate-500 hover:text-slate-800"}`} onClick={() => setTab(item.id)}>
                <StationIcon name={item.icon} className={`text-[15px] ${tab === item.id ? "text-blue-600" : ""}`} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6 bg-slate-50/70">
          {tab === "details" ? <DrawerDetails row={row} detail={detail} draft={draft} brands={brands} canWrite={canWrite} onChange={patch} /> : null}
          {tab === "location" ? (
            <DrawerLocation
              detail={detail}
              canWrite={canWrite}
              lat={lat}
              lng={lng}
              geofence={geofence}
              pinState={pinState}
              onMove={(nextLat, nextLng) => patch({ lat: nextLat, lng: nextLng })}
              onGeofence={(meters) => patch({ geofenceM: meters })}
              onPin={(state) => patch({ pinState: state })}
              onAddAlias={(raw) => save({ addAlias: { raw, lat, lng } })}
              onRemoveAlias={(id) => save({ removeAliasId: id })}
              onSync={() => save({ lat, lng })}
              nearby={nearby}
              onMerge={(id) => { if (reason.trim()) onMerge(id, reason.trim()); }}
            />
          ) : null}
          {tab === "prices" ? <DrawerPrices detail={detail} onOpenEngine={onOpenEngine} /> : null}
          {tab === "history" ? <DrawerHistory detail={detail} row={row} /> : null}
        </div>
        <div className="px-6 py-4 bg-white border-t border-slate-200/90 shadow-[0_-6px_20px_rgba(0,0,0,0.05)] flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1" htmlFor="change-reason">
                <span>Reason for change</span>
                <span className="text-rose-500 font-black">*</span>
              </label>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                <StationIcon name="lock" className="text-[12px] text-slate-500" />
                Audit-logged
              </span>
            </div>
            <input id="change-reason" className="w-full px-3.5 py-2 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600" placeholder="Explain why coordinates, geofence radius or details were modified..." value={reason} disabled={!canWrite} onChange={(event) => setReason(event.target.value)} />
          </div>
          <div className="flex items-center justify-between pt-1 gap-2">
            <div className="flex items-center gap-2">
              <button type="button" className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200/80 text-xs font-bold text-slate-700 hover:bg-slate-200/70 disabled:opacity-40" disabled={!canWrite || !reason.trim() || !nearby[0]} onClick={() => save({ status: "duplicate", duplicateOf: nearby[0]?.id })}>Mark duplicate…</button>
              <button type="button" className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200/80 text-xs font-bold text-slate-700 hover:bg-slate-200/70 disabled:opacity-40" disabled={!canWrite || !reason.trim()} onClick={() => save({ status: "pending", verifiedAt: null })}>Demote to pending</button>
            </div>
            <button type="button" className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/30 flex items-center gap-1.5 disabled:opacity-40" disabled={!canWrite || !reason.trim() || saving} onClick={() => save()}>
              <StationIcon name="save" className="text-[15px]" />
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
