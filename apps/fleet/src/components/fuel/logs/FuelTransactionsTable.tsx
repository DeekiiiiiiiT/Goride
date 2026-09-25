import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Checkbox } from '../../ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { cn } from '../../ui/utils';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Fuel,
  CreditCard,
  Banknote,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  HelpCircle,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { FuelEntry } from '../../../types/fuel';
import { Vehicle } from '../../../types/vehicle';
import type { StationProfile } from '../../../types/station';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { fuelServiceLineUiLabel } from '../../../utils/vocabulary';
import { serviceLineSourceLabel } from '../../../utils/fuelServiceLineFilter';
import { resolveFuelEntrySource } from '../../../utils/fuelEntrySource';
import { classifyFuelLogEdit } from '../../../utils/fuelLogEditGate';
import { resolveFuelEntryStationDisplay } from '../../../utils/jaaStationDisplay';
import {
  entrySourceLabel,
  formatFuelEntryTime,
  formatFuelLogDate,
} from './fuelLogDisplay';
import type { FuelLogDisplayRow } from './groupFuelEntriesByFillGroup';
import {
  cardDisplayAmount,
  cardSplitEntry,
  cashSplitEntry,
  isPendingSplitEntry,
  primaryEntryForDisplayRow,
  splitEntriesHaveMismatch,
  splitRowLiters,
} from './splitFillDisplay';

function AuditBreakdownItem({ label, value, max }: { label: string; value?: number; max: number }) {
  const percentage = ((value || 0) / max) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-medium">
        <span className="text-slate-500">{label}</span>
        <span className={cn(value ? 'text-slate-900' : 'text-slate-300')}>
          {value ?? 0} / {max}
        </span>
      </div>
      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            percentage >= 100 ? 'bg-emerald-500' : percentage > 0 ? 'bg-blue-500' : 'bg-slate-200',
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function getTypeIcon(label: string) {
  switch (label) {
    case 'Gas Card':
      return <CreditCard className="h-4 w-4 text-indigo-500" />;
    case 'Cash + Gas Card':
    case 'Gas Card + Cash':
      return <CreditCard className="h-4 w-4 text-emerald-600" />;
    case 'Cash':
    case 'Driver Cash':
      return <Banknote className="h-4 w-4 text-emerald-500" />;
    case 'RideShare Cash':
      return <Banknote className="h-4 w-4 text-orange-500" />;
    case 'Petty Cash':
      return <Banknote className="h-4 w-4 text-amber-500" />;
    case 'Reimbursement':
      return <HelpCircle className="h-4 w-4 text-slate-400" />;
    default:
      return <Fuel className="h-4 w-4 text-slate-500" />;
  }
}

/** Detailed Paid By for overlays (RideShare Cash, Driver Cash, etc.). */
export function resolvePaymentLabel(entry: FuelEntry): string {
  const source = entry.metadata?.paymentSource || (entry as FuelEntry & { paymentSource?: string }).paymentSource;
  if (source) {
    const labelMap: Record<string, string> = {
      driver_cash: 'Driver Cash',
      rideshare_cash: 'RideShare Cash',
      company_card: 'Gas Card',
      petty_cash: 'Petty Cash',
      Personal: 'Driver Cash',
      RideShare_Cash: 'RideShare Cash',
      Gas_Card: 'Gas Card',
      Petty_Cash: 'Petty Cash',
      Cash: 'Driver Cash',
      'RideShare Cash': 'RideShare Cash',
      'Gas Card': 'Gas Card',
      Other: 'Petty Cash',
    };
    if (labelMap[source]) return labelMap[source];
  }
  switch (entry.type) {
    case 'Card_Transaction':
      return 'Gas Card';
    case 'Fuel_Manual_Entry':
    case 'Manual_Entry':
      if (entry.paymentSource === 'Gas_Card') return 'Gas Card';
      return 'Driver Cash';
    case 'Reimbursement':
      return 'Reimbursement';
    default:
      return String(entry.type || 'Unknown').replace(/_/g, ' ');
  }
}

/** Transaction Logs Paid By column — only Cash / Gas Card / Cash + Gas Card. */
export function resolvePaymentLogLabel(entry: FuelEntry, isSplit = false): string {
  if (isSplit) return 'Cash + Gas Card';
  const detailed = resolvePaymentLabel(entry);
  if (detailed === 'Gas Card') return 'Gas Card';
  if (detailed === 'Gas Card + Cash' || detailed === 'Cash + Gas Card') return 'Cash + Gas Card';
  return 'Cash';
}

export type FuelTransactionsTableProps = {
  /** Grouped rows from FuelLogTable — one visual row per pump stop. */
  pagedDisplayRows: FuelLogDisplayRow[];
  /** Flattened entries on the page (selection / export). */
  pagedEntries: FuelEntry[];
  filteredCount: number;
  vehicles: Vehicle[];
  /** Verified Dominion stations for brand + street address display. */
  verifiedStations?: StationProfile[];
  page: number;
  pageCount: number;
  pageSize: number;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectPage: (checked: boolean) => void;
  sortField: 'date' | 'amount' | 'liters' | 'odometer';
  sortDir: 'asc' | 'desc';
  onToggleSort: (field: 'date' | 'amount' | 'liters' | 'odometer') => void;
  prevOdometerMap: Map<string, { prevOdo: number | null; prevDate: string | null }>;
  focusEntryId: string | null;
  getVehicleName: (id?: string) => string;
  getDriverName: (id?: string) => string;
  canEdit: boolean;
  canDelete: boolean;
  onView: (entry: FuelEntry, splitSiblings?: FuelEntry[]) => void;
  onEdit: (entry: FuelEntry, splitSiblings?: FuelEntry[]) => void;
  /** When set, show Resolve for awaiting-cash split rows (A7). */
  onResolveSplitCash?: (entry: FuelEntry, splitSiblings?: FuelEntry[]) => void;
  onDelete: (id: string) => void;
  onPageChange: (page: number) => void;
  /** Show service-line badge column (dual-line orgs). */
  showLineColumn?: boolean;
  /** When set, unlinked statement rows get Adopt/Link/Dismiss/Request actions. */
  onUnlinkedChargeAction?: (
    entry: FuelEntry,
    action: 'adopt' | 'link' | 'dismiss' | 'request_driver',
  ) => void;
};

export function FuelTransactionsTable({
  pagedDisplayRows,
  pagedEntries,
  filteredCount,
  vehicles,
  verifiedStations = [],
  page,
  pageCount,
  pageSize,
  selectedIds,
  onToggleSelect,
  onToggleSelectPage,
  sortField,
  sortDir,
  onToggleSort,
  prevOdometerMap,
  focusEntryId,
  getVehicleName,
  getDriverName,
  canEdit,
  canDelete,
  onView,
  onEdit,
  onResolveSplitCash,
  onDelete,
  onPageChange,
  showLineColumn = false,
  onUnlinkedChargeAction,
}: FuelTransactionsTableProps) {
  const sortIndicator = (field: 'date' | 'amount' | 'liters' | 'odometer') => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const pageAllSelected =
    pagedEntries.length > 0 && pagedEntries.every((e) => selectedIds.has(e.id));
  const pageSomeSelected =
    pagedEntries.some((e) => selectedIds.has(e.id)) && !pageAllSelected;

  const toggleRowSelection = (ids: string[]) => {
    const allOn = ids.every((id) => selectedIds.has(id));
    for (const id of ids) {
      if (allOn) {
        if (selectedIds.has(id)) onToggleSelect(id);
      } else if (!selectedIds.has(id)) {
        onToggleSelect(id);
      }
    }
  };

  return (
    <>
      <Table>
        <TableHeader className="sticky top-0 bg-white z-10">
          <TableRow>
            <TableHead className="hidden w-10 md:table-cell">
              <Checkbox
                checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                onCheckedChange={(v) => onToggleSelectPage(v === true)}
                aria-label="Select all on page"
              />
            </TableHead>
            <TableHead>
              <button type="button" className="font-medium hover:text-slate-900" onClick={() => onToggleSort('date')}>
                Date{sortIndicator('date')}
              </button>
            </TableHead>
            <TableHead>Paid By</TableHead>
            {showLineColumn ? (
              <TableHead className="hidden md:table-cell">Line</TableHead>
            ) : null}
            <TableHead className="hidden md:table-cell">Station</TableHead>
            <TableHead className="hidden md:table-cell">Vehicle</TableHead>
            <TableHead className="hidden md:table-cell">Driver</TableHead>
            <TableHead className="hidden md:table-cell">
              <button type="button" className="font-medium hover:text-slate-900" onClick={() => onToggleSort('liters')}>
                Vol (L){sortIndicator('liters')}
              </button>
            </TableHead>
            <TableHead className="hidden md:table-cell">
              <button type="button" className="font-medium hover:text-slate-900" onClick={() => onToggleSort('odometer')}>
                Odo{sortIndicator('odometer')}
              </button>
            </TableHead>
            <TableHead
              className="hidden md:table-cell"
              title="Pump-to-pump odometer change only — not Odometer History / Live Status"
            >
              Δ Odo
            </TableHead>
            <TableHead>
              <button type="button" className="font-medium hover:text-slate-900" onClick={() => onToggleSort('amount')}>
                Cost{sortIndicator('amount')}
              </button>
            </TableHead>
            <TableHead className="hidden text-center md:table-cell">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help font-medium">
                    Audit
                    <span className="block text-[11px] font-normal text-slate-400 normal-case tracking-normal">
                      GPS · Sig · Odo
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px]">
                  <p className="text-xs font-semibold">Audit dots</p>
                  <p className="mt-1 text-[11px] text-slate-300">
                    Three dots under the score: GPS station match · cryptographic signature · odometer present.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className="w-12 text-right md:w-auto">
              <span className="sr-only md:not-sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredCount === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="h-24 text-center">
                No transactions found
              </TableCell>
            </TableRow>
          ) : (
            pagedDisplayRows.map((row) => {
              const entry = primaryEntryForDisplayRow(row);
              const isSplit = row.kind === 'split';
              const rowIds = isSplit ? row.entries.map((e) => e.id) : [entry.id];
              const splitSiblings = isSplit ? row.entries : undefined;
              const cashLeg = isSplit ? cashSplitEntry(row.entries) : undefined;
              const cardLeg = isSplit ? cardSplitEntry(row.entries) : undefined;
              const pendingHalf = !isSplit && isPendingSplitEntry(entry);
              const hasMismatch = isSplit
                ? splitEntriesHaveMismatch(row.entries)
                : entry.metadata?.splitVariance === true &&
                  entry.metadata?.splitReconciled !== true;
              const displayLiters = isSplit ? splitRowLiters(row) : Number(entry.liters) || 0;
              const displayAmount = isSplit
                ? Number(row.pumpTotal) || 0
                : Number(entry.amount) || 0;
              const paidByLabel = resolvePaymentLogLabel(entry, isSplit);
              const locationStatus = entry.metadata?.locationStatus || entry.locationStatus;
              const confidenceScore = entry.metadata?.auditConfidenceScore;
              const isHighlyTrusted =
                entry.metadata?.isHighlyTrusted ||
                (confidenceScore !== undefined && confidenceScore >= 90);
              const isLocked = entry.isLocked || entry.status === 'Finalized';
              const entryTimeLabel = formatFuelEntryTime(entry);
              const rowSelected = rowIds.every((id) => selectedIds.has(id));
              const focusHit = rowIds.includes(focusEntryId || '');
              const editGate = classifyFuelLogEdit(entry, splitSiblings || []);
              const showResolve =
                editGate.kind === 'resolve_split_cash' && !!onResolveSplitCash;
              const editDisabled =
                isLocked ||
                !canEdit ||
                editGate.kind === 'awaiting_card_readonly';
              const editLabel =
                editGate.kind === 'resolve_split_cash'
                  ? 'Resolve Cash'
                  : editGate.kind === 'awaiting_card_readonly'
                    ? 'Awaiting Statement'
                    : 'Edit Log';

              return (
                <TableRow
                  key={row.id}
                  className={cn(
                    isLocked && 'bg-slate-50/50',
                    focusHit && 'bg-emerald-50 ring-2 ring-inset ring-emerald-300',
                    rowSelected && 'bg-indigo-50/40',
                  )}
                >
                  <TableCell className="hidden md:table-cell">
                    <Checkbox
                      checked={rowSelected}
                      onCheckedChange={() => toggleRowSelection(rowIds)}
                      aria-label={`Select ${row.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>{formatFuelLogDate(entry.date)}</span>
                      {entryTimeLabel && (
                        <span className="text-[11px] font-medium tabular-nums text-slate-500">
                          {entryTimeLabel}
                        </span>
                      )}
                      {resolveFuelEntrySource(entry) !== 'driver-portal' &&
                        (() => {
                          const src = entrySourceLabel(resolveFuelEntrySource(entry));
                          return (
                            <Badge
                              variant="outline"
                              className={cn('h-4 w-fit px-1 py-0 text-[11px] font-bold', src.color)}
                            >
                              {src.label}
                            </Badge>
                          );
                        })()}
                      {(entry.metadata as { fillOrigin?: string })?.fillOrigin ===
                        'statement_adopted' && (
                        <Badge
                          variant="outline"
                          className="h-4 w-fit px-1 py-0 text-[11px] font-bold border-amber-200 bg-amber-50 text-amber-900"
                        >
                          Statement adopted
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {getTypeIcon(paidByLabel)}
                        <span className="text-xs">{paidByLabel}</span>
                        {(isSplit || pendingHalf) && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[9px] border-emerald-200 bg-emerald-50 text-emerald-800"
                          >
                            {pendingHalf ? 'Split (pending)' : 'Split'}
                          </Badge>
                        )}
                        {hasMismatch && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[9px] border-rose-200 bg-rose-50 text-rose-800"
                          >
                            Mismatch
                          </Badge>
                        )}
                      </div>
                      {isSplit && (
                        <span className="text-[11px] text-slate-500">
                          {cashLeg?.metadata?.awaitingCashStatement
                            ? 'Cash pending statement'
                            : `Cash ${formatFuelMoney(Number(cashLeg?.amount) || 0)}`}
                          {' · '}
                          Card {formatFuelMoney(cardDisplayAmount(cardLeg))}
                        </span>
                      )}
                      {pendingHalf && (
                        <span className="text-[11px] text-amber-600">
                          Cash approval or statement still open
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {showLineColumn ? (
                    <TableCell className="hidden md:table-cell">
                      {(() => {
                        const line =
                          entry.serviceLine ??
                          (entry as { service_line?: string }).service_line ??
                          null;
                        const src =
                          entry.serviceLineSource ??
                          (entry as { service_line_source?: string }).service_line_source ??
                          null;
                        const label =
                          line === 'rush_delivery'
                            ? fuelServiceLineUiLabel('rush_delivery')
                            : line === 'rideshare'
                              ? fuelServiceLineUiLabel('rideshare')
                              : fuelServiceLineUiLabel('unattributed');
                        const tip =
                          line === 'rush_delivery' || line === 'rideshare'
                            ? `${label} — ${serviceLineSourceLabel(src)}`
                            : 'Needs service-line attribution';
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={
                                  line === 'rush_delivery'
                                    ? 'border-violet-200 bg-violet-50 text-violet-800'
                                    : line === 'rideshare'
                                      ? 'border-slate-200 bg-slate-50 text-slate-700'
                                      : 'border-amber-200 bg-amber-50 text-amber-900'
                                }
                              >
                                {label}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>{tip}</TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden md:table-cell">
                    {(() => {
                      const stationDisplay = resolveFuelEntryStationDisplay(
                        entry,
                        verifiedStations,
                      );
                      return (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="max-w-[140px] truncate text-xs font-semibold text-slate-700">
                          {stationDisplay.title}
                        </span>
                        {locationStatus === 'verified' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-shrink-0 animate-in zoom-in-95 rounded-full border border-blue-100 bg-blue-50 p-0.5 text-blue-600 duration-300">
                                <ShieldCheck className="h-2.5 w-2.5" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1">
                                <p className="text-[11px] font-bold">Verified Station</p>
                                <p className="text-[11px]">
                                  Mapped to Master Ledger via{' '}
                                  {(entry.metadata?.verificationMethod || 'gps').replace(/_/g, ' ')}.
                                </p>
                                {entry.metadata?.matchDistance !== undefined && (
                                  <p className="text-[11px] font-medium text-blue-500">
                                    GPS offset from station anchor: {entry.metadata.matchDistance}m
                                  </p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {locationStatus === 'review_required' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-shrink-0 rounded-full border border-amber-100 bg-amber-50 p-0.5 text-amber-600">
                                <AlertTriangle className="h-2.5 w-2.5" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-[11px] font-bold">Review Required</p>
                              <p className="text-[11px]">
                                GPS match requires admin review —{' '}
                                {entry.metadata?.ambiguityReason || 'multiple nearby stations detected'}.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {(locationStatus === 'unknown' || !locationStatus) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex animate-pulse items-center gap-1.5 rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-amber-600">
                                <AlertCircle className="h-2.5 w-2.5" />
                                <span className="text-[11px] font-bold uppercase tracking-tighter">
                                  Review Required
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-[11px] font-bold">Unverified Location</p>
                              <p className="text-[11px]">
                                No verified station link yet — Roam ops will match this, or wait for a server
                                match.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <span
                        title={stationDisplay.subtitle}
                        className="max-w-[140px] truncate text-[11px] text-slate-400"
                      >
                        {stationDisplay.subtitle}
                      </span>
                    </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="hidden text-xs font-medium md:table-cell">{getVehicleName(entry.vehicleId)}</TableCell>
                  <TableCell className="hidden text-xs md:table-cell">{getDriverName(entry.driverId)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {(() => {
                      const vehicle = vehicles.find((v) => v.id === entry.vehicleId);
                      const tankCap =
                        Number(vehicle?.specifications?.tankCapacity) ||
                        vehicle?.fuelSettings?.tankCapacity ||
                        0;
                      const fillPct =
                        tankCap > 0 ? Math.min(100, (displayLiters / tankCap) * 100) : 0;
                      return (
                        <div className="flex min-w-[50px] flex-col gap-1">
                          <span className="text-xs font-medium">{displayLiters.toFixed(1)} L</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="h-1.5 w-12 cursor-help overflow-hidden rounded-full border border-slate-200/50 bg-slate-100">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all duration-300',
                                    fillPct >= 90
                                      ? 'bg-emerald-500'
                                      : fillPct >= 50
                                        ? 'bg-blue-500'
                                        : fillPct >= 25
                                          ? 'bg-amber-500'
                                          : 'bg-slate-300',
                                  )}
                                  style={{ width: `${fillPct}%` }}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-[11px]">
                                {tankCap > 0
                                  ? `${fillPct.toFixed(0)}% of ${tankCap}L tank capacity`
                                  : 'Tank capacity not configured'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="font-mono text-xs font-semibold text-slate-800">
                      {entry.odometer != null && Number(entry.odometer) > 0
                        ? Number(entry.odometer).toLocaleString()
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {(() => {
                      const prev = prevOdometerMap.get(entry.id);
                      if (!prev || prev.prevOdo == null)
                        return <span className="text-xs text-slate-300">—</span>;
                      const curOdo = entry.odometer != null ? Number(entry.odometer) : 0;
                      const isRegression = curOdo < prev.prevOdo;
                      const delta = Math.abs(curOdo - prev.prevOdo);
                      const isZeroDelta = !isRegression && delta === 0;
                      return (
                        <div className="flex flex-col">
                          <span className="text-[11px] text-slate-400">
                            {prev.prevOdo.toLocaleString()}
                          </span>
                          <span
                            className={`text-[11px] font-medium ${
                              isRegression
                                ? 'text-red-600'
                                : isZeroDelta
                                  ? 'text-amber-600'
                                  : 'text-green-600'
                            }`}
                          >
                            {isRegression
                              ? `▼ ${delta.toLocaleString()}`
                              : isZeroDelta
                                ? '+0 same odo'
                                : `▲ +${delta.toLocaleString()}`}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-xs font-bold">
                    {isSplit ? (
                      formatFuelMoney(displayAmount)
                    ) : (entry.metadata as { awaitingCardStatement?: boolean })?.awaitingCardStatement ? (
                      <span className="font-medium text-amber-600">Awaiting</span>
                    ) : (entry.metadata as { jaaRowKind?: string })?.jaaRowKind === 'declined' ? (
                      <span className="font-medium text-rose-600">Declined</span>
                    ) : (entry.metadata as { jaaRowKind?: string })?.jaaRowKind === 'fee' ? (
                      <span className="text-slate-500">{formatFuelMoney(entry.amount ?? 0)} fee</span>
                    ) : (
                      formatFuelMoney(entry.amount ?? 0)
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex justify-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              'flex h-10 w-10 cursor-help flex-col items-center justify-center rounded-lg border transition-all',
                              confidenceScore === undefined
                                ? 'border-slate-100 bg-slate-50 text-slate-300'
                                : confidenceScore >= 90
                                  ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
                                  : confidenceScore >= 70
                                    ? 'border-blue-100 bg-blue-50 text-blue-600'
                                    : 'border-amber-100 bg-amber-50 text-amber-600',
                            )}
                          >
                            {isLocked ? (
                              <ShieldCheck className="h-4 w-4" />
                            ) : (
                              <span className="text-[11px] font-bold">{confidenceScore ?? '??'}</span>
                            )}
                            <div className="flex gap-0.5 mt-0.5">
                              <div
                                className={cn(
                                  'h-1 w-1 rounded-full',
                                  entry.matchedStationId ? 'bg-current' : 'bg-slate-200',
                                )}
                              />
                              <div
                                className={cn(
                                  'h-1 w-1 rounded-full',
                                  entry.signature ? 'bg-current' : 'bg-slate-200',
                                )}
                              />
                              <div
                                className={cn(
                                  'h-1 w-1 rounded-full',
                                  entry.odometer != null && Number(entry.odometer) > 0
                                    ? 'bg-current'
                                    : 'bg-slate-200',
                                )}
                              />
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="w-64 p-0" side="left">
                          <div className="p-3 space-y-3">
                            <div className="flex justify-between items-center">
                              <p className="text-xs font-bold uppercase tracking-wider">Audit Confidence</p>
                              <Badge
                                className={cn(
                                  'h-5 text-[11px] border-none',
                                  isHighlyTrusted
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-slate-200 text-slate-600',
                                )}
                              >
                                {confidenceScore ?? 'PENDING'}%
                              </Badge>
                            </div>
                            {entry.metadata?.decisionReason && (
                              <p className="text-[11px] text-slate-500">
                                Decision: {String(entry.metadata.decisionReason).replace(/_/g, ' ')}
                              </p>
                            )}
                            <div className="space-y-1.5">
                              <AuditBreakdownItem
                                label="GPS Handshake"
                                value={entry.metadata?.auditConfidenceBreakdown?.gps}
                                max={30}
                              />
                              <AuditBreakdownItem
                                label="Proximity Bonus"
                                value={entry.metadata?.auditConfidenceBreakdown?.gps_bonus}
                                max={5}
                              />
                              <AuditBreakdownItem
                                label="SHA-256 Sign"
                                value={entry.metadata?.auditConfidenceBreakdown?.crypto}
                                max={25}
                              />
                              <AuditBreakdownItem
                                label="Physical Data"
                                value={entry.metadata?.auditConfidenceBreakdown?.physical}
                                max={25}
                              />
                              <AuditBreakdownItem
                                label="Behavioral"
                                value={entry.metadata?.auditConfidenceBreakdown?.behavioral}
                                max={20}
                              />
                            </div>
                            {isLocked && (
                              <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-emerald-600">
                                <CheckCircle2 className="h-3 w-3" />
                                <p className="text-[11px] font-bold">LOCKED & IMMUTABLE</p>
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-11 min-w-11 text-slate-500 hover:text-slate-800 md:hidden"
                        title="View Details"
                        aria-label="View Details"
                        onClick={() => onView(entry, splitSiblings)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="hidden h-8 w-8 text-slate-400 hover:text-slate-600 md:inline-flex"
                            title="Actions"
                            aria-label="Row actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">
                            Log Actions
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onView(entry, splitSiblings)}
                            className="cursor-pointer gap-2 text-xs"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-500" />
                            View Details
                          </DropdownMenuItem>
                          {onUnlinkedChargeAction &&
                          (entry.metadata as { jaaRowKind?: string })?.jaaRowKind ===
                            'approved_fuel' &&
                          !(entry.metadata as { jaaMatchedDriverEntryId?: string })
                            ?.jaaMatchedDriverEntryId &&
                          !(entry.metadata as { adoptionDismissedAt?: string })
                            ?.adoptionDismissedAt ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-amber-700">
                                Unlinked charge
                              </DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => onUnlinkedChargeAction(entry, 'adopt')}
                                disabled={!canEdit}
                                className="cursor-pointer gap-2 text-xs"
                              >
                                Adopt into logs
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onUnlinkedChargeAction(entry, 'link')}
                                disabled={!canEdit}
                                className="cursor-pointer gap-2 text-xs"
                              >
                                Link to existing log
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onUnlinkedChargeAction(entry, 'dismiss')}
                                disabled={!canEdit}
                                className="cursor-pointer gap-2 text-xs"
                              >
                                Dismiss
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onUnlinkedChargeAction(entry, 'request_driver')}
                                disabled={!canEdit}
                                className="cursor-pointer gap-2 text-xs"
                              >
                                Request driver log
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          ) : null}
                          {showResolve ? (
                            <DropdownMenuItem
                              onClick={() => onResolveSplitCash?.(entry, splitSiblings)}
                              disabled={isLocked || !canEdit}
                              className="cursor-pointer gap-2 text-xs"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-500" />
                              Resolve Cash
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => onEdit(entry, splitSiblings)}
                              disabled={editDisabled}
                              title={
                                editGate.kind === 'awaiting_card_readonly'
                                  ? editGate.reason
                                  : undefined
                              }
                              className="cursor-pointer gap-2 text-xs"
                            >
                              <Pencil className="h-3.5 w-3.5 text-slate-500" />
                              {editLabel}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(entry.id)}
                            disabled={isLocked || !canDelete}
                            className="cursor-pointer gap-2 text-xs text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete Log
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {filteredCount > pageSize && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
          <span className="text-[11px] text-slate-500">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredCount)} of{' '}
            {filteredCount.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page === 0}
              onClick={() => onPageChange(Math.max(0, page - 1))}
            >
              Previous
            </Button>
            <span className="text-[11px] font-semibold text-slate-600">
              Page {page + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page >= pageCount - 1}
              onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default FuelTransactionsTable;
