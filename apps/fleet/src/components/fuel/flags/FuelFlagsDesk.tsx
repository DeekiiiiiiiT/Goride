/**
 * Fuel Flags desk — triage queue for problem fills (Integrity / Outlier).
 */
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
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
import { plainEnglishForFlagReason } from '../analytics/fuelFlagGlossary';

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
  canDisposition,
  canAcceptCritical,
  onAcceptFlag,
  onEditFill,
  onReconcileWeek,
}: {
  periods: FuelFlagsPeriodOption[];
  selectedWeekStart: string | null;
  onSelectWeekStart: (weekStart: string) => void;
  rows: FuelFlagDeskRow[];
  loading?: boolean;
  canDisposition?: boolean;
  canAcceptCritical?: boolean;
  onAcceptFlag?: (
    row: FuelFlagDeskRow,
    flagCode: string,
    note: string,
    action?: 'accepted' | 'escalated',
  ) => Promise<void> | void;
  onEditFill?: (entryId: string) => void;
  onReconcileWeek?: (weekStart: string) => void;
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

  useEffect(() => {
    if (selected?.locked) setStatusFilter('all');
  }, [selectedWeekStart, selected?.locked]);

  const overlayLegend = FUEL_FLAG_CATEGORY_LEGEND.find((i) => i.id === overlayLegendId) || null;

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows;
    if (statusFilter === 'resolved') return rows.filter((r) => r.status === 'resolved');
    if (statusFilter === 'cleared') return rows.filter((r) => r.status === 'cleared_by_lock');
    return rows.filter((r) => r.status === 'open');
  }, [rows, statusFilter]);

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

  const openCriticalOnDetail = detailRow?.reasons.find(
    (r) => r.severity === 'critical' && !r.resolved,
  );

  return (
    <div className="space-y-4">
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
              <div className="mt-5 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Flag</th>
                      <th className="py-2 font-semibold">Meaning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {overlayLegend.rows.map((row) => (
                      <tr key={row.flag}>
                        <td className="py-2.5 pr-3 align-top font-medium text-slate-900">
                          {row.flag}
                        </td>
                        <td className="py-2.5 align-top text-slate-600">{row.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
        {selectedWeekStart && onReconcileWeek && (
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
                {g.rows.map((r) => (
                  <li key={r.entryId}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/80"
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
                ))}
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
                {detailRow.reasons.map((reason) => (
                  <li
                    key={`${reason.code}|${reason.label}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <p className="font-semibold text-slate-900">{reason.label}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {plainEnglishForFlagReason(reason.label)}
                    </p>
                    {reason.resolved && reason.disposition && (
                      <p className="mt-1 text-xs text-emerald-800">
                        {reason.disposition.action} · {reason.disposition.note || 'no note'}
                        {reason.disposition.at
                          ? ` · ${String(reason.disposition.at).slice(0, 10)}`
                          : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {detailRow.status === 'open' && canDisposition && (
                <div className="mt-5 space-y-3">
                  {openCriticalOnDetail && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600">
                        Accept note (required for critical, 8+)
                      </label>
                      <Textarea
                        value={acceptNote}
                        onChange={(e) => setAcceptNote(e.target.value)}
                        className="min-h-[72px]"
                        disabled={acceptBusy}
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    className="min-h-11 w-full bg-[#3525cd] text-white hover:bg-[#2a1ea4]"
                    disabled={
                      acceptBusy ||
                      !onAcceptFlag ||
                      (openCriticalOnDetail
                        ? !canAcceptCritical || acceptNote.trim().length < 8
                        : false)
                    }
                    onClick={async () => {
                      if (!onAcceptFlag || !detailRow) return;
                      const code =
                        openCriticalOnDetail?.code ||
                        detailRow.reasons.find((r) => !r.resolved)?.code;
                      if (!code) return;
                      setAcceptBusy(true);
                      try {
                        await onAcceptFlag(detailRow, code, acceptNote.trim());
                        setDetailRow(null);
                        setAcceptNote('');
                      } finally {
                        setAcceptBusy(false);
                      }
                    }}
                  >
                    Accept with note
                  </Button>
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
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={acceptBusy || !onAcceptFlag}
                    onClick={async () => {
                      if (!onAcceptFlag || !detailRow) return;
                      const code = detailRow.reasons.find((r) => !r.resolved)?.code;
                      if (!code) return;
                      setAcceptBusy(true);
                      try {
                        await onAcceptFlag(
                          detailRow,
                          code,
                          acceptNote.trim() || 'Escalated to dispute',
                          'escalated',
                        );
                        setDetailRow(null);
                      } finally {
                        setAcceptBusy(false);
                      }
                    }}
                  >
                    Escalate to dispute
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
