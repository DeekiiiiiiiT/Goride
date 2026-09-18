/**
 * Fuel Flags desk — triage queue for problem fills (Integrity / Outlier).
 */
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet';
import { Textarea } from '../../ui/textarea';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import {
  FUEL_FLAG_CATEGORY_LEGEND,
  FUEL_FLAG_RECON_NOTE,
  type FuelFlagDeskRow,
  type FuelFillFlagCategory,
} from '../../../utils/fuelFillFlagClassify';
import { formatFuelLogDate } from '../logs/fuelLogDisplay';
import { FlagCheckGuideBlock } from '../analytics/FlagCheckGuideBlock';
import { toast } from 'sonner';

export type FuelFlagsPeriodOption = {
  weekStart: string;
  weekEnd: string;
  label: string;
  locked: boolean;
};

const CAT_CLASS: Record<FuelFillFlagCategory, string> = {
  Integrity: 'border-[#3525cd]/30 bg-[#f0ecf9] text-[#3525cd]',
  Outlier: 'border-violet-200 bg-violet-50 text-violet-800',
};

function statusLabel(status: FuelFlagDeskRow['status']): string {
  if (status === 'resolved') return 'Resolved';
  if (status === 'cleared_by_lock') return 'Cleared by lock';
  return 'Open';
}

export function FuelFlagsDesk({
  periods,
  selectedWeekStart,
  onSelectWeekStart,
  rows,
  loading,
  dispositionsTruncated,
  canDisposition,
  canAcceptCritical,
  onAcceptFlag,
  onEditFill,
  onReconcileWeek,
  embeddedInShell = false,
}: {
  periods: FuelFlagsPeriodOption[];
  selectedWeekStart: string | null;
  onSelectWeekStart: (weekStart: string) => void;
  rows: FuelFlagDeskRow[];
  loading?: boolean;
  /** R-2: server could not return every disposition for this week’s fills. */
  dispositionsTruncated?: boolean;
  canDisposition?: boolean;
  canAcceptCritical?: boolean;
  onAcceptFlag?: (
    row: FuelFlagDeskRow,
    flagCode: string,
    note: string,
    action?: 'accepted' | 'escalated' | 'corrected',
    opts?: { quiet?: boolean },
  ) => Promise<void> | void;
  onEditFill?: (entryId: string) => void;
  onReconcileWeek?: (weekStart: string) => void;
  /** Period + reconcile owned by FuelIntegrityDesk. */
  embeddedInShell?: boolean;
}) {
  const selected = periods.find((p) => p.weekStart === selectedWeekStart) || null;
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'cleared' | 'all'>(() =>
    selected?.locked ? 'all' : 'open',
  );
  const [legendOpen, setLegendOpen] = useState(true);
  const [overlayLegendId, setOverlayLegendId] = useState<FuelFillFlagCategory | null>(null);
  const [detailRow, setDetailRow] = useState<FuelFlagDeskRow | null>(null);
  const [acceptNote, setAcceptNote] = useState('');
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkNote, setBulkNote] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (selected?.locked) setStatusFilter('all');
  }, [selectedWeekStart, selected?.locked]);

  useEffect(() => {
    setSelectedIds(new Set());
    setBulkNote('');
  }, [selectedWeekStart, statusFilter]);

  const overlayLegend = FUEL_FLAG_CATEGORY_LEGEND.find((i) => i.id === overlayLegendId) || null;

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows;
    if (statusFilter === 'resolved') return rows.filter((r) => r.status === 'resolved');
    if (statusFilter === 'cleared') return rows.filter((r) => r.status === 'cleared_by_lock');
    return rows.filter((r) => r.status === 'open');
  }, [rows, statusFilter]);

  const selectableRows = useMemo(
    () => filtered.filter((r) => r.status === 'open' && r.reasons.some((rr) => !rr.resolved)),
    [filtered],
  );
  const selectableIdSet = useMemo(
    () => new Set(selectableRows.map((r) => r.entryId)),
    [selectableRows],
  );

  // Drop selections that left the current filter / were resolved.
  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (selectableIdSet.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectableIdSet]);

  const openCount = rows.filter((r) => r.status === 'open').length;
  const resolvedCount = rows.filter((r) => r.status === 'resolved').length;
  const atRisk = rows
    .filter((r) => r.status === 'open')
    .reduce((s, r) => s + (Number(r.entry.amount) || 0), 0);

  const grouped = useMemo(() => {
    const map = new Map<string, FuelFlagDeskRow[]>();
    for (const r of filtered) {
      const key = r.entry.vehicleId || r.plate;
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()].map(([vehicleKey, list]) => ({
      vehicleKey,
      plate: list[0]?.plate || vehicleKey,
      rows: list,
      amount: list.reduce((s, x) => s + (Number(x.entry.amount) || 0), 0),
      openFlags: list.reduce(
        (s, x) => s + x.reasons.filter((rr) => !rr.resolved).length,
        0,
      ),
    }));
  }, [filtered]);

  const selectedRows = useMemo(
    () => selectableRows.filter((r) => selectedIds.has(r.entryId)),
    [selectableRows, selectedIds],
  );
  const selectedOpenReasons = useMemo(
    () =>
      selectedRows.flatMap((r) =>
        r.reasons.filter((rr) => !rr.resolved).map((rr) => ({ row: r, reason: rr })),
      ),
    [selectedRows],
  );
  const selectedHasCritical = selectedOpenReasons.some((x) => x.reason.severity === 'critical');
  const allSelectableChecked =
    selectableRows.length > 0 && selectableRows.every((r) => selectedIds.has(r.entryId));
  const someSelectableChecked = selectableRows.some((r) => selectedIds.has(r.entryId));

  const toggleRowSelected = (entryId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(entryId);
      else next.delete(entryId);
      return next;
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableRows.map((r) => r.entryId)));
  };

  const runBulkAction = async (action: 'accepted' | 'escalated') => {
    if (!onAcceptFlag || selectedOpenReasons.length === 0) return;
    if (action === 'accepted' && selectedHasCritical) {
      if (!canAcceptCritical) return;
      if (bulkNote.trim().length < 8) return;
    }
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const { row, reason } of selectedOpenReasons) {
        const note =
          action === 'escalated'
            ? bulkNote.trim() || 'Escalated to dispute'
            : bulkNote.trim();
        try {
          await onAcceptFlag(row, reason.code, note, action, { quiet: true });
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      setSelectedIds(new Set());
      setBulkNote('');
      if (ok > 0 && failed === 0) {
        toast.success(
          action === 'escalated'
            ? `Escalated ${ok} flag${ok === 1 ? '' : 's'}`
            : `Accepted ${ok} flag${ok === 1 ? '' : 's'}`,
        );
      } else if (ok > 0 && failed > 0) {
        toast.error(`Saved ${ok}, failed ${failed}`);
      } else if (failed > 0) {
        toast.error('Could not save bulk disposition');
      }
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {dispositionsTruncated && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Some older decisions didn’t load for this week — refresh or narrow the week so resolved
          flags don’t look open by mistake.
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">What we monitor</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Standing fill triage. Open a row to accept, edit, or escalate.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-9"
            onClick={() => setLegendOpen((v) => !v)}
          >
            {legendOpen ? 'Hide' : 'Show'} legend
          </Button>
        </div>
        {legendOpen && (
          <>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {FUEL_FLAG_CATEGORY_LEGEND.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOverlayLegendId(item.id)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs transition-colors hover:border-[#3525cd]/40 hover:bg-[#f0ecf9]/50"
                  >
                    <span
                      className={`mr-1.5 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${CAT_CLASS[item.id]}`}
                    >
                      {item.id}
                    </span>
                    <span className="font-semibold text-slate-800">{item.title}</span>
                    <p className="mt-1 leading-relaxed text-slate-500">{item.body}</p>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">{FUEL_FLAG_RECON_NOTE}</p>
          </>
        )}
      </div>

      <Sheet
        open={Boolean(overlayLegend)}
        onOpenChange={(open) => {
          if (!open) setOverlayLegendId(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {overlayLegend && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8 text-left">{overlayLegend.detailTitle}</SheetTitle>
                <SheetDescription className="text-left">{overlayLegend.body}</SheetDescription>
              </SheetHeader>
              <div className="mt-5 space-y-4">
                {overlayLegend.rows.map((row) => (
                  <div
                    key={row.flag}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                  >
                    <p className="text-sm font-semibold text-slate-900">{row.flag}</p>
                    <div className="mt-2">
                      <FlagCheckGuideBlock reason={row.flag} />
                    </div>
                  </div>
                ))}
                {overlayLegend.bullets && overlayLegend.bullets.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {overlayLegend.bulletsTitle || 'Common reasons'}
                    </p>
                    {overlayLegend.bullets.map((b) => (
                        <div
                          key={b}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                        >
                          <p className="text-sm font-semibold text-slate-900">{b}</p>
                          <div className="mt-2">
                            <FlagCheckGuideBlock reason={b} />
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {overlayLegend.note && (
                  <p className="text-xs text-slate-500">{overlayLegend.note}</p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {!embeddedInShell && (
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
            Period
            <select
              className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={selectedWeekStart || ''}
              onChange={(e) => onSelectWeekStart(e.target.value)}
            >
              {periods.length === 0 && <option value="">No periods</option>}
              {periods.map((p) => (
                <option key={p.weekStart} value={p.weekStart}>
                  {p.label}
                  {p.locked ? ' · Locked' : ' · Open'}
                </option>
              ))}
            </select>
          </label>
        )}
        {!embeddedInShell && selectedWeekStart && onReconcileWeek && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onReconcileWeek(selectedWeekStart)}
          >
            Reconcile this week →
          </Button>
        )}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['open', 'Open'],
              ['resolved', 'Resolved'],
              ['cleared', 'Cleared by lock'],
              ['all', 'All'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={statusFilter === id ? 'default' : 'outline'}
              className={`min-h-9 ${
                statusFilter === id ? 'bg-[#3525cd] text-white hover:bg-[#2a1ea4]' : ''
              }`}
              onClick={() => setStatusFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="w-full text-sm font-medium text-slate-800 sm:w-auto">
          {openCount} open · {resolvedCount} resolved · {formatFuelMoney(atRisk)} at risk
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center shadow-sm">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#3525cd]" />
          <p className="text-sm text-slate-600">Loading flagged fills…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-16 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-800">
            {rows.length === 0
              ? 'No problem fills in this period'
              : statusFilter === 'open'
                ? 'No open flags — try Resolved, Cleared by lock, or All'
                : 'Nothing matches this filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {canDisposition && selectableRows.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                  <Checkbox
                    checked={
                      allSelectableChecked
                        ? true
                        : someSelectableChecked
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={(v) => toggleSelectAllVisible(v === true)}
                    disabled={bulkBusy}
                    aria-label="Select all open flags"
                  />
                  Select all open
                </label>
                <p className="text-sm text-slate-600">
                  {selectedIds.size === 0
                    ? `${selectableRows.length} open fill${selectableRows.length === 1 ? '' : 's'} available`
                    : `${selectedIds.size} selected · ${selectedOpenReasons.length} open flag${
                        selectedOpenReasons.length === 1 ? '' : 's'
                      }`}
                </p>
              </div>
              {selectedIds.size > 0 && (
                <div className="flex flex-col gap-3 border-t border-slate-100 pt-3">
                  {selectedHasCritical && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">
                        Note for critical accept (8+ characters)
                      </label>
                      <Textarea
                        value={bulkNote}
                        onChange={(e) => setBulkNote(e.target.value)}
                        className="min-h-[72px]"
                        disabled={bulkBusy}
                        placeholder="Required to accept critical flags in bulk"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="min-h-11 bg-[#3525cd] text-white hover:bg-[#2a1ea4]"
                      disabled={
                        bulkBusy ||
                        !onAcceptFlag ||
                        (selectedHasCritical &&
                          (!canAcceptCritical || bulkNote.trim().length < 8))
                      }
                      onClick={() => void runBulkAction('accepted')}
                    >
                      Accept selected ({selectedOpenReasons.length})
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={bulkBusy || !onAcceptFlag}
                      onClick={() => void runBulkAction('escalated')}
                    >
                      Escalate selected ({selectedOpenReasons.length})
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11"
                      disabled={bulkBusy}
                      onClick={() => {
                        setSelectedIds(new Set());
                        setBulkNote('');
                      }}
                    >
                      Clear selection
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {grouped.map((g) => (
            <div
              key={g.vehicleKey}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <p className="text-sm font-semibold text-slate-900">
                  {g.plate} — {g.openFlags} flag{g.openFlags === 1 ? '' : 's'},{' '}
                  {formatFuelMoney(g.amount)}
                </p>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.rows.map((r) => {
                  const canSelect =
                    canDisposition &&
                    r.status === 'open' &&
                    r.reasons.some((rr) => !rr.resolved);
                  return (
                    <li key={r.entryId} className="flex items-stretch gap-0">
                      {canDisposition && (
                        <div className="flex shrink-0 items-center border-r border-slate-100 px-3">
                          {canSelect ? (
                            <Checkbox
                              checked={selectedIds.has(r.entryId)}
                              onCheckedChange={(v) =>
                                toggleRowSelected(r.entryId, v === true)
                              }
                              disabled={bulkBusy}
                              aria-label={`Select ${r.plate} ${formatFuelLogDate(r.dateYmd)}`}
                            />
                          ) : (
                            <span className="inline-block size-4" aria-hidden />
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/80"
                        onClick={() => {
                          setDetailRow(r);
                          setAcceptNote('');
                        }}
                      >
                        <span className="w-24 shrink-0 text-sm text-slate-700">
                          {formatFuelLogDate(r.dateYmd)}
                        </span>
                        <span className="min-w-[5rem] text-sm font-medium tabular-nums text-slate-900">
                          {formatFuelMoney(Number(r.entry.amount) || 0)}
                        </span>
                        <div className="flex flex-1 flex-wrap gap-1">
                          {r.reasons.map((reason) => (
                            <Badge
                              key={`${reason.code}|${reason.label}`}
                              variant="outline"
                              className={`text-[10px] font-medium ${
                                reason.resolved
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : reason.severity === 'critical'
                                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                                    : reason.severity === 'warning'
                                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                                      : 'border-slate-200 bg-slate-50 text-slate-700'
                              }`}
                            >
                              {reason.label}
                            </Badge>
                          ))}
                        </div>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            r.status === 'open'
                              ? 'border-amber-200 bg-amber-50 text-amber-900'
                              : r.status === 'resolved'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={Boolean(detailRow)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailRow(null);
            setAcceptNote('');
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {detailRow && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8 text-left">
                  {detailRow.plate} · {formatFuelLogDate(detailRow.dateYmd)}
                </SheetTitle>
                <SheetDescription className="text-left">
                  {detailRow.driverName} · {formatFuelMoney(Number(detailRow.entry.amount) || 0)}
                </SheetDescription>
              </SheetHeader>

              <ul className="mt-4 space-y-2">
                {detailRow.reasons.map((reason) => {
                  const isOpen = !reason.resolved;
                  const needsCriticalNote = reason.severity === 'critical' && isOpen;
                  const acceptDisabled =
                    acceptBusy ||
                    !onAcceptFlag ||
                    !isOpen ||
                    (needsCriticalNote
                      ? !canAcceptCritical || acceptNote.trim().length < 8
                      : false);
                  return (
                    <li
                      key={`${reason.code}|${reason.label}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <p className="font-semibold text-slate-900">{reason.label}</p>
                      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        {reason.code.replace(/_/g, ' ')} · {reason.severity}
                      </p>
                      <div className="mt-2">
                        <FlagCheckGuideBlock reason={reason.label} />
                      </div>
                      {reason.resolved && reason.disposition && (
                        <p className="mt-1 text-xs text-emerald-800">
                          {reason.disposition.action} · {reason.disposition.note || 'no note'}
                          {reason.disposition.at
                            ? ` · ${String(reason.disposition.at).slice(0, 10)}`
                            : ''}
                        </p>
                      )}
                      {isOpen && canDisposition && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="min-h-9 bg-[#3525cd] text-white hover:bg-[#2a1ea4]"
                            disabled={acceptDisabled}
                            onClick={async () => {
                              if (!onAcceptFlag || !detailRow) return;
                              setAcceptBusy(true);
                              try {
                                await onAcceptFlag(
                                  detailRow,
                                  reason.code,
                                  acceptNote.trim(),
                                  'accepted',
                                );
                                setDetailRow((prev) => {
                                  if (!prev) return null;
                                  const nextReasons = prev.reasons.map((r) =>
                                    r.code === reason.code
                                      ? {
                                          ...r,
                                          resolved: true,
                                          disposition: {
                                            entryId: prev.entryId,
                                            flagCode: reason.code,
                                            action: 'accepted' as const,
                                            note: acceptNote.trim() || null,
                                          },
                                        }
                                      : r,
                                  );
                                  const stillOpen = nextReasons.some((r) => !r.resolved);
                                  if (!stillOpen) {
                                    setAcceptNote('');
                                    return null;
                                  }
                                  return {
                                    ...prev,
                                    reasons: nextReasons,
                                    status: 'open' as const,
                                    hasOpenCritical: nextReasons.some(
                                      (r) => r.severity === 'critical' && !r.resolved,
                                    ),
                                  };
                                });
                              } finally {
                                setAcceptBusy(false);
                              }
                            }}
                          >
                            Accept {reason.label}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-9"
                            disabled={acceptBusy || !onAcceptFlag}
                            onClick={async () => {
                              if (!onAcceptFlag || !detailRow) return;
                              setAcceptBusy(true);
                              try {
                                await onAcceptFlag(
                                  detailRow,
                                  reason.code,
                                  acceptNote.trim() || 'Escalated to dispute',
                                  'escalated',
                                );
                                setDetailRow((prev) => {
                                  if (!prev) return null;
                                  const nextReasons = prev.reasons.map((r) =>
                                    r.code === reason.code
                                      ? {
                                          ...r,
                                          resolved: true,
                                          disposition: {
                                            entryId: prev.entryId,
                                            flagCode: reason.code,
                                            action: 'escalated' as const,
                                            note: acceptNote.trim() || 'Escalated to dispute',
                                          },
                                        }
                                      : r,
                                  );
                                  const stillOpen = nextReasons.some((r) => !r.resolved);
                                  if (!stillOpen) {
                                    setAcceptNote('');
                                    return null;
                                  }
                                  return {
                                    ...prev,
                                    reasons: nextReasons,
                                    status: 'open' as const,
                                    hasOpenCritical: nextReasons.some(
                                      (r) => r.severity === 'critical' && !r.resolved,
                                    ),
                                  };
                                });
                              } finally {
                                setAcceptBusy(false);
                              }
                            }}
                          >
                            Escalate {reason.label}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {detailRow.status === 'open' && canDisposition && (
                <div className="mt-5 space-y-3">
                  {detailRow.reasons.some((r) => r.severity === 'critical' && !r.resolved) && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">
                        Note for critical accept (8+ characters)
                      </label>
                      <Textarea
                        value={acceptNote}
                        onChange={(e) => setAcceptNote(e.target.value)}
                        className="min-h-[72px]"
                        disabled={acceptBusy}
                      />
                    </div>
                  )}
                  {onEditFill && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 w-full"
                      disabled={acceptBusy}
                      onClick={() => {
                        onEditFill(detailRow.entryId);
                        setDetailRow(null);
                      }}
                    >
                      Edit fill
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
