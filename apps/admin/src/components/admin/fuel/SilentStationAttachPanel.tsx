import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../services/api';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Checkbox } from '../../ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import {
  Loader2,
  Link2,
  RefreshCw,
  ShieldCheck,
  MapPin,
  Trash2,
  MoreHorizontal,
  Search,
  XCircle,
  Building2,
  ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';

const parentKey = (brand?: string) => {
  const b = String(brand || '').trim();
  return b || 'Independent';
};

type QueueItem = {
  id: string;
  recordType?: 'fuel_entry' | 'transaction';
  date?: string;
  time?: string | null;
  vendor?: string;
  location?: string;
  amount?: number;
  liters?: number;
  vehicleId?: string;
  driverId?: string;
  organizationId?: string;
  lat?: number;
  lng?: number;
  suggestedStationId?: string;
  suggestedStationName?: string;
  suggestedScore?: number;
  linkedTwinIds?: string[];
  fleetVisibleEntryId?: string;
  linkage?: 'jaa_pair' | 'solo';
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

export interface SilentStationAttachPanelProps {
  /** Tighter layout when nested under Resolution Queue. */
  embedded?: boolean;
  /** Report queue size for parent badge. */
  onCountChange?: (count: number) => void;
  onResolved?: () => void;
}

/**
 * Dominion Silent Station Attach — manual ops only.
 * Queue auto-loads merchant-match candidates.
 * Row ⋯ menu: Silent Attach (suggestion) | Choose GOD station | Delete permanently.
 */
export function SilentStationAttachPanel({
  embedded = false,
  onCountChange,
  onResolved,
}: SilentStationAttachPanelProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stations, setStations] = useState<VerifiedStation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stationSearch, setStationSearch] = useState('');
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [panelHighlight, setPanelHighlight] = useState(false);

  const stationSearchRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const attachPanelRef = useRef<HTMLDivElement>(null);

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  const reasonRefValue = useRef(reason);
  reasonRefValue.current = reason;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [preview, stationList] = await Promise.all([
        api.autohealMerchantStations({ dryRun: true, limit: 200 }),
        api.getStations(),
      ]);

      const list = preview.candidates || [];
      const suggested: QueueItem[] = list.map((c) => ({
        id: c.entryId,
        recordType: 'fuel_entry' as const,
        vendor: c.merchantText,
        date: c.date,
        time: c.time,
        amount: c.amount,
        liters: c.liters,
        suggestedStationId: c.stationId,
        suggestedStationName: c.stationName,
        suggestedScore: c.score,
        linkedTwinIds: c.linkedTwinIds || [],
        fleetVisibleEntryId: c.fleetVisibleEntryId || c.entryId,
        linkage: c.linkage || (c.linkedTwinIds && c.linkedTwinIds.length > 0 ? 'jaa_pair' : 'solo'),
        metadata: { locationStatus: 'unknown' },
      }));
      setItems(suggested);
      setSelectedIds(new Set());
      setSelectedParent(null);
      setStationSearch('');
      setSelectedStationId(null);
      onCountChangeRef.current?.(suggested.length);

      const rawList = Array.isArray(stationList)
        ? stationList
        : Array.isArray((stationList as { stations?: VerifiedStation[] })?.stations)
          ? (stationList as { stations: VerifiedStation[] }).stations
          : [];
      const verified = rawList.filter(
        (s: VerifiedStation) => s && s.id && (!s.status || s.status === 'verified'),
      );
      setStations(verified);

      const stationIds = new Set(list.map((c) => c.stationId));
      if (stationIds.size === 1) {
        const sid = list[0].stationId;
        setSelectedStationId(sid);
        const match = verified.find((s) => s.id === sid);
        if (match) {
          setSelectedParent(parentKey(match.brand));
          setStationSearch('');
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load Silent Attach queue');
      setItems([]);
      onCountChangeRef.current?.(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Parent companies derived from verified station brands. */
  const parentCompanies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stations) {
      const key = parentKey(s.brand);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [stations]);

  /** Stations under the selected parent, filtered by search. */
  const stationsInParent = useMemo(() => {
    if (!selectedParent) return [];
    const q = stationSearch.trim().toLowerCase();
    return stations
      .filter((s) => parentKey(s.brand) === selectedParent)
      .filter((s) => {
        if (!q) return true;
        return (
          s.name?.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q) ||
          s.id?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  }, [stations, selectedParent, stationSearch]);

  const openParent = (name: string) => {
    setSelectedParent(name);
    setStationSearch('');
    setSelectedStationId(null);
  };

  const backToParents = () => {
    setSelectedParent(null);
    setStationSearch('');
    setSelectedStationId(null);
  };

  const selectStation = (station: VerifiedStation) => {
    setSelectedStationId(station.id);
    setSelectedParent(parentKey(station.brand));
  };

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

  const selectOnlyRow = (id: string) => {
    setSelectedIds(new Set([id]));
  };

  const formatLoggedAt = (row: QueueItem): string => {
    const raw = String(row.date || '').trim();
    if (!raw) return 'Date unknown';
    try {
      if (raw.includes('T')) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) {
          return d.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
        }
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split('-').map(Number);
        const base = new Date(y, m - 1, d);
        const timeRaw = String(row.time || '').trim();
        const tm = timeRaw.match(/^(\d{1,2}):(\d{2})/);
        if (tm) {
          base.setHours(Number(tm[1]), Number(tm[2]), 0, 0);
          return base.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
        }
        return base.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      }
    } catch {
      /* fall through */
    }
    return raw;
  };

  const focusAttachPanel = (opts?: {
    stationName?: string;
    stationId?: string;
    focusReason?: boolean;
  }) => {
    setPanelHighlight(true);
    window.setTimeout(() => setPanelHighlight(false), 1600);
    attachPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const match =
      (opts?.stationId && stations.find((s) => s.id === opts.stationId)) ||
      (opts?.stationName
        ? stations.find((s) => s.name?.toLowerCase() === opts.stationName!.toLowerCase()) ||
          stations.find((s) => s.name?.toLowerCase().includes(opts.stationName!.toLowerCase()))
        : undefined);

    if (match) {
      setSelectedParent(parentKey(match.brand));
      setStationSearch(opts?.stationName || match.name || '');
      setSelectedStationId(match.id);
    } else if (opts?.stationName) {
      setStationSearch(opts.stationName);
    }

    window.setTimeout(() => {
      if (opts?.focusReason) reasonRef.current?.focus();
      else if (match) stationSearchRef.current?.focus();
    }, 80);
  };

  const permanentlyDeleteIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const twinExtras = new Set<string>();
    for (const id of ids) {
      const row = items.find((i) => i.id === id);
      for (const t of row?.linkedTwinIds || []) twinExtras.add(t);
    }
    const twinCount = [...twinExtras].filter((t) => !ids.includes(t)).length;
    const twinHint =
      twinCount > 0
        ? `\n\nAlso deletes ${twinCount} linked JAA/driver twin(s) for the same stop.`
        : '';
    const label =
      ids.length === 1
        ? `This permanently deletes this fuel fill from the system (money record gone — not just removed from the queue).${twinHint}\n\nContinue?`
        : `This permanently deletes ${ids.length} fuel fills from the system (money records gone — not just removed from the queue).${twinHint}\n\nContinue?`;
    if (!window.confirm(label)) return;

    setDeleting(true);
    try {
      const recordTypes: Record<string, 'fuel_entry' | 'transaction'> = {};
      for (const id of ids) {
        const row = items.find((i) => i.id === id);
        if (row?.recordType) recordTypes[id] = row.recordType;
      }
      const res = await api.platformOpsDeleteFills({
        ids,
        reason: reason.trim() || 'Silent Attach queue — ops hard delete',
        recordTypes: Object.keys(recordTypes).length ? recordTypes : undefined,
      });
      toast.success(res.message || `Deleted ${res.summary?.deleted || 0} fill(s)`);
      const removed = new Set([
        ...ids,
        ...(res.twinIds || []),
        ...[...twinExtras],
      ]);
      const nextItems = items.filter((i) => !removed.has(i.id));
      setItems(nextItems);
      onCountChangeRef.current?.(nextItems.length);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
      onResolved?.();
    } catch (e: any) {
      toast.error(e?.message || 'Permanent delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const attachEntryIds = async (entryIds: string[], stationId: string, reasonText: string) => {
    setAttaching(true);
    try {
      const res = await api.platformOpsAttachStation({
        entryIds,
        stationId,
        reason: reasonText,
        dismissLearnt: true,
      });
      const twinN = res.summary?.pairExpanded || res.twinIds?.length || 0;
      toast.success(
        res.message ||
          (twinN > 0
            ? `Attached ${res.summary?.updated || 0} fill(s) including ${twinN} linked twin(s)`
            : `Attached ${res.summary?.updated || 0} fill(s)`),
      );
      setReason('');
      setSelectedIds(new Set());
      onResolved?.();
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Silent Attach failed');
    } finally {
      setAttaching(false);
    }
  };

  const runSilentAttach = async () => {
    const reasonText = reason.trim();
    if (!reasonText) {
      toast.error('Reason is required for Silent Attach');
      reasonRef.current?.focus();
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
    await attachEntryIds(Array.from(selectedIds), selectedStationId, reasonText);
  };

  /** Row menu: attach this fill using its merchant suggestion. */
  const attachUsingSuggestion = async (row: QueueItem) => {
    if (!row.suggestedStationId) {
      toast.error('No suggested GOD station for this fill');
      return;
    }
    const reasonText = reasonRefValue.current.trim();
    if (!reasonText) {
      selectOnlyRow(row.id);
      focusAttachPanel({
        stationId: row.suggestedStationId,
        stationName: row.suggestedStationName,
        focusReason: true,
      });
      toast.message('Enter a reason, then Silent Attach');
      return;
    }
    selectOnlyRow(row.id);
    const match = stations.find((s) => s.id === row.suggestedStationId);
    if (match) selectStation(match);
    else setSelectedStationId(row.suggestedStationId);
    await attachEntryIds([row.id], row.suggestedStationId, reasonText);
  };

  /** Row menu: select fill and focus station picker (parent → station). */
  const chooseGodStation = (row: QueueItem) => {
    selectOnlyRow(row.id);
    focusAttachPanel({
      stationId: row.suggestedStationId,
      stationName: row.suggestedStationName,
    });
    toast.message('Pick a parent company (or confirm suggestion), then enter a reason');
  };

  const shellClass = embedded ? 'space-y-4 p-4' : 'space-y-6 p-6';

  return (
    <div className={shellClass}>
      {!embedded && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-1">
              <h2 className="flex items-center gap-2 text-base font-semibold text-violet-950">
                <ShieldCheck className="h-5 w-5 text-violet-700" />
                Silent Station Attach
              </h2>
              <p className="text-sm leading-relaxed text-violet-900/90">
                Manual Roam ops only. Use the row menu to attach to a GOD station or delete the fill permanently.
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      )}

      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500 max-w-2xl">
            Fills waiting for a GOD station attach. Linked JAA + driver pairs update together — Fleet sees the
            driver/ops row. Use ⋯: Silent Attach, choose a station, or delete permanently.
          </p>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          <p className="text-sm text-slate-500">Loading attach queue…</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b px-3 py-2 bg-slate-50 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Checkbox
                  checked={items.length > 0 && selectedIds.size === items.length}
                  onCheckedChange={() => selectAll()}
                />
                <span className="text-xs font-medium text-slate-600">
                  Attach queue ({items.length})
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {selectedIds.size} selected
                </Badge>
              </div>
              {selectedIds.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-red-700 border-red-200 hover:bg-red-50 shrink-0"
                  disabled={deleting}
                  onClick={() => void permanentlyDeleteIds(Array.from(selectedIds))}
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete selected
                </Button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="p-8 text-sm text-slate-500 text-center">
                No fills need Silent Attach right now.
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
                        {row.suggestedStationName && (
                          <Badge variant="outline" className="text-[9px] text-violet-700 border-violet-200">
                            Suggest: {row.suggestedStationName}
                            {row.suggestedScore != null
                              ? ` (${Math.round(row.suggestedScore * 100)}%)`
                              : ''}
                          </Badge>
                        )}
                        {(row.linkage === 'jaa_pair' || (row.linkedTwinIds && row.linkedTwinIds.length > 0)) && (
                          <Badge variant="outline" className="text-[9px] text-emerald-800 border-emerald-200 bg-emerald-50">
                            Linked fill (JAA + driver)
                          </Badge>
                        )}
                        {row.metadata?.matchDistance != null && (
                          <Badge variant="outline" className="text-[9px] gap-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            {Math.round(Number(row.metadata.matchDistance))}m
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {formatLoggedAt(row)}
                        {row.amount != null ? ` · $${Number(row.amount).toFixed(2)}` : ''}
                        {row.organizationId ? ` · org ${String(row.organizationId).slice(0, 8)}…` : ''}
                        {(row.linkage === 'jaa_pair' || (row.linkedTwinIds && row.linkedTwinIds.length > 0))
                          ? ' · Fleet sees driver/ops row — attach updates both'
                          : ''}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800 shrink-0"
                          disabled={attaching || deleting}
                          aria-label="Row actions"
                        >
                          {attaching || deleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-80">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                          Resolve
                        </DropdownMenuLabel>
                        {row.suggestedStationId && (
                          <DropdownMenuItem
                            className="gap-2.5 text-violet-700 focus:text-violet-800 focus:bg-violet-50 items-start py-2"
                            onClick={() => void attachUsingSuggestion(row)}
                          >
                            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                              <div className="text-sm font-medium">Silent Attach (use suggestion)</div>
                              <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                                Stamp this fill
                                {row.linkedTwinIds && row.linkedTwinIds.length > 0
                                  ? ' and its linked JAA/driver twin'
                                  : ''}{' '}
                                to {row.suggestedStationName || 'suggested GOD station'}. Reason required.
                              </div>
                            </div>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="gap-2.5 text-emerald-700 focus:text-emerald-800 focus:bg-emerald-50 items-start py-2"
                          onClick={() => chooseGodStation(row)}
                        >
                          <Search className="h-4 w-4 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-sm font-medium">Choose GOD station…</div>
                            <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                              Select this fill and pick a Verified station in the panel.
                            </div>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                          Discard
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          className="gap-2.5 text-red-700 focus:text-red-800 focus:bg-red-50 items-start py-2"
                          onClick={() => void permanentlyDeleteIds([row.id])}
                        >
                          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-sm font-medium">Delete permanently</div>
                            <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                              Removes this fuel fill
                              {row.linkedTwinIds && row.linkedTwinIds.length > 0
                                ? ' and linked twin(s)'
                                : ''}{' '}
                              from the system — not just this queue.
                            </div>
                          </div>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            ref={attachPanelRef}
            className={`rounded-lg border bg-white p-4 space-y-3 h-fit sticky top-4 transition-shadow ${
              panelHighlight
                ? 'border-violet-400 ring-2 ring-violet-200 shadow-md'
                : 'border-slate-200'
            }`}
          >
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Link2 className="h-4 w-4 text-violet-600" />
              Attach to GOD station
            </h3>

            {!selectedParent ? (
              <>
                <p className="text-[11px] text-slate-500">Select a parent company first.</p>
                <div className="max-h-56 overflow-y-auto border rounded-md divide-y">
                  {parentCompanies.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => openParent(p.name)}
                      className="w-full text-left px-2.5 py-2.5 text-xs hover:bg-violet-50 flex items-center gap-2"
                    >
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-800 font-medium truncate">{p.name}</div>
                        <div className="text-slate-400">
                          {p.count} station{p.count === 1 ? '' : 's'}
                        </div>
                      </div>
                    </button>
                  ))}
                  {parentCompanies.length === 0 && (
                    <p className="p-3 text-xs text-slate-400">No verified parent companies found.</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={backToParents}
                  className="flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:underline"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  All parent companies
                </button>
                <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  {selectedParent}
                </div>
                <Input
                  ref={stationSearchRef}
                  placeholder={`Search ${selectedParent} stations…`}
                  value={stationSearch}
                  onChange={(e) => setStationSearch(e.target.value)}
                  className="h-9 text-sm"
                />
                <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                  {stationsInParent.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectStation(s)}
                      className={`w-full text-left px-2.5 py-2 text-xs hover:bg-violet-50 ${
                        selectedStationId === s.id ? 'bg-violet-100 font-medium' : ''
                      }`}
                    >
                      <div className="text-slate-800">{s.name}</div>
                      {s.address && <div className="text-slate-400 truncate">{s.address}</div>}
                    </button>
                  ))}
                  {stationsInParent.length === 0 && (
                    <p className="p-3 text-xs text-slate-400">No stations match in this company.</p>
                  )}
                </div>
              </>
            )}

            {selectedStationId && (
              <p className="text-[11px] text-violet-800 bg-violet-50 border border-violet-100 rounded-md px-2 py-1.5">
                Selected:{' '}
                {stations.find((s) => s.id === selectedStationId)?.name || selectedStationId.slice(0, 8)}
              </p>
            )}

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Reason (required)
              </label>
              <Textarea
                ref={reasonRef}
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
              Attach is audited. ⋯ → Delete permanently removes the fill after you confirm.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default SilentStationAttachPanel;
