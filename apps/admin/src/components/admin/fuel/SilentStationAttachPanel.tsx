import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/api';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Checkbox } from '../../ui/checkbox';
import {
  Loader2,
  Link2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';

type QueueItem = {
  id: string;
  recordType?: 'fuel_entry' | 'transaction';
  date?: string;
  vendor?: string;
  location?: string;
  amount?: number;
  liters?: number;
  vehicleId?: string;
  driverId?: string;
  organizationId?: string;
  lat?: number;
  lng?: number;
  metadata?: {
    locationStatus?: string;
    matchDistance?: number;
    ambiguityReason?: string;
    verificationMethod?: string;
  };
};

type VerifiedStation = {
  id: string;
  name?: string;
  brand?: string;
  status?: string;
  address?: string;
  location?: { lat?: number; lng?: number };
};

/**
 * Dominion-only Silent Station Attach + merchant auto-heal controls.
 * Fleet customers never see this panel — they only see verified logs after ops/heal.
 */
export function SilentStationAttachPanel() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stations, setStations] = useState<VerifiedStation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stationSearch, setStationSearch] = useState('');
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [healBusy, setHealBusy] = useState(false);
  const [healPreview, setHealPreview] = useState<
    Array<{ entryId: string; stationName: string; score: number; merchantText: string }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queue, stationList] = await Promise.all([
        api.getSpatialReviewQueue(),
        api.getStations(),
      ]);
      setItems((queue.items || []) as QueueItem[]);
      const rawList = Array.isArray(stationList)
        ? stationList
        : Array.isArray((stationList as { stations?: VerifiedStation[] })?.stations)
          ? (stationList as { stations: VerifiedStation[] }).stations
          : [];
      const verified = rawList.filter(
        (s: VerifiedStation) => s && s.id && (!s.status || s.status === 'verified'),
      );
      setStations(verified);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load Silent Attach queue');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredStations = useMemo(() => {
    const q = stationSearch.trim().toLowerCase();
    if (!q) return stations.slice(0, 40);
    return stations
      .filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.brand?.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [stations, stationSearch]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const runSilentAttach = async () => {
    const reasonText = reason.trim();
    if (!reasonText) {
      toast.error('Reason is required for Silent Attach');
      return;
    }
    if (!selectedStationId) {
      toast.error('Pick a Verified GOD station');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('Select at least one fill');
      return;
    }
    setAttaching(true);
    try {
      const res = await api.platformOpsAttachStation({
        entryIds: Array.from(selectedIds),
        stationId: selectedStationId,
        reason: reasonText,
        dismissLearnt: true,
      });
      toast.success(res.message || `Attached ${res.summary?.updated || 0} fill(s)`);
      setReason('');
      setSelectedIds(new Set());
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Silent Attach failed');
    } finally {
      setAttaching(false);
    }
  };

  const runHealDry = async () => {
    setHealBusy(true);
    try {
      const res = await api.autohealMerchantStations({ dryRun: true, limit: 200 });
      setHealPreview(res.candidates || []);
      toast.message(res.message || `Dry-run: ${res.summary?.candidates || 0} candidate(s)`);
    } catch (e: any) {
      toast.error(e?.message || 'Dry-run failed');
    } finally {
      setHealBusy(false);
    }
  };

  const runHealApply = async () => {
    setHealBusy(true);
    try {
      const res = await api.autohealMerchantStations({ dryRun: false, limit: 200 });
      toast.success(res.message || `Healed ${res.summary?.healed || 0}`);
      setHealPreview([]);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Auto-heal apply failed');
    } finally {
      setHealBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-1">
            <h2 className="flex items-center gap-2 text-base font-semibold text-violet-950">
              <ShieldCheck className="h-5 w-5 text-violet-700" />
              Silent Station Attach
            </h2>
            <p className="text-sm leading-relaxed text-violet-900/90">
              Roam company ops only. Attach drifted GPS fills to a Verified GOD station without changing
              money, liters, or odometer. Fleet customers see the log clear to verified — no merge work
              on their side.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Merchant auto-heal */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Merchant-name auto-heal
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              When card merchant text uniquely matches GOD and odometer sequence looks healthy.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={healBusy} onClick={() => void runHealDry()}>
              {healBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Dry-run
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              disabled={healBusy || healPreview.length === 0}
              onClick={() => void runHealApply()}
            >
              Apply {healPreview.length > 0 ? `(${healPreview.length})` : ''}
            </Button>
          </div>
        </div>
        {healPreview.length > 0 && (
          <ul className="max-h-40 overflow-y-auto text-xs space-y-1 border rounded-md p-2 bg-slate-50">
            {healPreview.map((c) => (
              <li key={c.entryId} className="flex justify-between gap-2">
                <span className="font-mono truncate">{c.entryId.slice(0, 8)}…</span>
                <span className="text-slate-600 truncate">
                  {c.merchantText} → {c.stationName} ({(c.score * 100).toFixed(0)}%)
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          <p className="text-sm text-slate-500">Loading spatial review queue…</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b px-3 py-2 bg-slate-50">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={items.length > 0 && selectedIds.size === items.length}
                  onCheckedChange={() => selectAll()}
                />
                <span className="text-xs font-medium text-slate-600">
                  Review Required ({items.length})
                </span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {selectedIds.size} selected
              </Badge>
            </div>
            {items.length === 0 ? (
              <p className="p-8 text-sm text-slate-500 text-center">
                No GPS-ambiguous rows in the spatial review queue.
              </p>
            ) : (
              <ul className="divide-y max-h-[480px] overflow-y-auto">
                {items.map((row) => (
                  <li key={row.id} className="flex gap-3 px-3 py-2.5 hover:bg-slate-50/80">
                    <Checkbox
                      checked={selectedIds.has(row.id)}
                      onCheckedChange={() => toggleId(row.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800 truncate">
                          {row.vendor || row.location || 'Unknown vendor'}
                        </span>
                        {row.metadata?.matchDistance != null && (
                          <Badge variant="outline" className="text-[9px] gap-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            {Math.round(Number(row.metadata.matchDistance))}m
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {row.date || '—'}
                        {row.amount != null ? ` · $${Number(row.amount).toFixed(2)}` : ''}
                        {row.organizationId ? ` · org ${String(row.organizationId).slice(0, 8)}…` : ''}
                      </p>
                      {row.metadata?.ambiguityReason && (
                        <p className="text-[10px] text-amber-700 line-clamp-2">
                          {row.metadata.ambiguityReason}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 h-fit sticky top-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Link2 className="h-4 w-4 text-violet-600" />
              Attach to GOD station
            </h3>
            <Input
              placeholder="Search verified stations…"
              value={stationSearch}
              onChange={(e) => setStationSearch(e.target.value)}
              className="h-9 text-sm"
            />
            <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
              {filteredStations.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStationId(s.id)}
                  className={`w-full text-left px-2.5 py-2 text-xs hover:bg-violet-50 ${
                    selectedStationId === s.id ? 'bg-violet-100 font-medium' : ''
                  }`}
                >
                  <div className="text-slate-800">{s.name}</div>
                  {s.brand && <div className="text-slate-400">{s.brand}</div>}
                </button>
              ))}
              {filteredStations.length === 0 && (
                <p className="p-3 text-xs text-slate-400">No verified stations match.</p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Reason (required)
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. GPS drift — filled at FESCO Beechwood per card merchant"
                className="mt-1 min-h-[80px] text-sm"
              />
            </div>
            <Button
              className="w-full gap-1.5 bg-violet-700 hover:bg-violet-800"
              disabled={attaching || selectedIds.size === 0 || !selectedStationId || !reason.trim()}
              onClick={() => void runSilentAttach()}
            >
              {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Silent Attach
            </Button>
            <p className="text-[10px] text-slate-400 leading-snug">
              Logged to Activity Log as silent_station_attach. Money fields are never changed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SilentStationAttachPanel;
