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
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { resolveFuelEntrySource } from '../../../utils/fuelEntrySource';
import {
  entrySourceLabel,
  formatFuelEntryTime,
  formatFuelLogDate,
} from './fuelLogDisplay';

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

export type FuelTransactionsTableProps = {
  pagedEntries: FuelEntry[];
  filteredCount: number;
  vehicles: Vehicle[];
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
  onView: (entry: FuelEntry) => void;
  onEdit: (entry: FuelEntry) => void;
  onDelete: (id: string) => void;
  onPageChange: (page: number) => void;
};

export function FuelTransactionsTable({
  pagedEntries,
  filteredCount,
  vehicles,
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
  onDelete,
  onPageChange,
}: FuelTransactionsTableProps) {
  const sortIndicator = (field: 'date' | 'amount' | 'liters' | 'odometer') => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const pageAllSelected =
    pagedEntries.length > 0 && pagedEntries.every((e) => selectedIds.has(e.id));
  const pageSomeSelected =
    pagedEntries.some((e) => selectedIds.has(e.id)) && !pageAllSelected;

  return (
    <>
      <Table>
        <TableHeader className="sticky top-0 bg-white z-10">
          <TableRow>
            <TableHead className="w-10">
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
            <TableHead>Station</TableHead>
            <TableHead>Vehicle</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>
              <button type="button" className="font-medium hover:text-slate-900" onClick={() => onToggleSort('liters')}>
                Vol (L){sortIndicator('liters')}
              </button>
            </TableHead>
            <TableHead>
              <button type="button" className="font-medium hover:text-slate-900" onClick={() => onToggleSort('odometer')}>
                Odo{sortIndicator('odometer')}
              </button>
            </TableHead>
            <TableHead title="Pump-to-pump odometer change only — not Odometer History / Live Status">
              Δ Odo
            </TableHead>
            <TableHead>
              <button type="button" className="font-medium hover:text-slate-900" onClick={() => onToggleSort('amount')}>
                Cost{sortIndicator('amount')}
              </button>
            </TableHead>
            <TableHead className="text-center">
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
                  <p className="text-[11px] text-slate-300 mt-1">
                    Three dots under the score: GPS station match · cryptographic signature · odometer present.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className="text-right">Actions</TableHead>
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
            pagedEntries.map((entry) => {
              const locationStatus = entry.metadata?.locationStatus || entry.locationStatus;
              const confidenceScore = entry.metadata?.auditConfidenceScore;
              const isHighlyTrusted =
                entry.metadata?.isHighlyTrusted ||
                (confidenceScore !== undefined && confidenceScore >= 90);
              const isLocked = entry.isLocked || entry.status === 'Finalized';
              const entryTimeLabel = formatFuelEntryTime(entry);

              return (
                <TableRow
                  key={entry.id}
                  className={cn(
                    isLocked && 'bg-slate-50/50',
                    focusEntryId === entry.id && 'bg-emerald-50 ring-2 ring-inset ring-emerald-300',
                    selectedIds.has(entry.id) && 'bg-indigo-50/40',
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(entry.id)}
                      onCheckedChange={() => onToggleSelect(entry.id)}
                      aria-label={`Select ${entry.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>{formatFuelLogDate(entry.date)}</span>
                      {entryTimeLabel && (
                        <span className="text-[11px] text-slate-500 font-medium tabular-nums">
                          {entryTimeLabel}
                        </span>
                      )}
                      {resolveFuelEntrySource(entry) !== 'driver-portal' &&
                        (() => {
                          const src = entrySourceLabel(resolveFuelEntrySource(entry));
                          return (
                            <Badge
                              variant="outline"
                              className={cn('text-[11px] font-bold px-1 py-0 h-4 w-fit', src.color)}
                            >
                              {src.label}
                            </Badge>
                          );
                        })()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getTypeIcon(resolvePaymentLabel(entry))}
                      <span className="text-xs">{resolvePaymentLabel(entry)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-700 truncate max-w-[140px]">
                          {entry.location ||
                            entry.vendor ||
                            entry.metadata?.stationName ||
                            'Unknown Station'}
                        </span>
                        {locationStatus === 'verified' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="bg-blue-50 text-blue-600 p-0.5 rounded-full border border-blue-100 flex-shrink-0 animate-in zoom-in-95 duration-300">
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
                                  <p className="text-[11px] text-blue-500 font-medium">
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
                              <div className="bg-amber-50 text-amber-600 p-0.5 rounded-full border border-amber-100 flex-shrink-0">
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
                              <div className="flex items-center gap-1.5 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 animate-pulse">
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
                        title={entry.location}
                        className="text-[11px] text-slate-400 truncate max-w-[140px]"
                      >
                        {entry.location || 'No GPS metadata'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-xs">{getVehicleName(entry.vehicleId)}</TableCell>
                  <TableCell className="text-xs">{getDriverName(entry.driverId)}</TableCell>
                  <TableCell>
                    {(() => {
                      const vehicle = vehicles.find((v) => v.id === entry.vehicleId);
                      const tankCap =
                        Number(vehicle?.specifications?.tankCapacity) ||
                        vehicle?.fuelSettings?.tankCapacity ||
                        0;
                      const fillPct =
                        tankCap > 0 ? Math.min(100, ((entry.liters || 0) / tankCap) * 100) : 0;
                      return (
                        <div className="flex flex-col gap-1 min-w-[50px]">
                          <span className="text-xs font-medium">{entry.liters?.toFixed(1)} L</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50 cursor-help">
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
                  <TableCell>
                    <span className="text-xs font-semibold font-mono text-slate-800">
                      {entry.odometer != null && Number(entry.odometer) > 0
                        ? Number(entry.odometer).toLocaleString()
                        : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
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
                  <TableCell className="font-bold text-xs">
                    {(entry.metadata as { awaitingCardStatement?: boolean })?.awaitingCardStatement ? (
                      <span className="text-amber-600 font-medium">Awaiting</span>
                    ) : (entry.metadata as { jaaRowKind?: string })?.jaaRowKind === 'declined' ? (
                      <span className="text-rose-600 font-medium">Declined</span>
                    ) : (entry.metadata as { jaaRowKind?: string })?.jaaRowKind === 'fee' ? (
                      <span className="text-slate-500">{formatFuelMoney(entry.amount ?? 0)} fee</span>
                    ) : (
                      formatFuelMoney(entry.amount ?? 0)
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              'flex flex-col items-center justify-center w-10 h-10 rounded-lg border transition-all cursor-help',
                              confidenceScore === undefined
                                ? 'bg-slate-50 border-slate-100 text-slate-300'
                                : confidenceScore >= 90
                                  ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                  : confidenceScore >= 70
                                    ? 'bg-blue-50 border-blue-100 text-blue-600'
                                    : 'bg-amber-50 border-amber-100 text-amber-600',
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-slate-600"
                            title="Actions"
                            aria-label="Row actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuLabel className="text-[11px] text-slate-400 uppercase tracking-wider">
                            Log Actions
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onView(entry)}
                            className="gap-2 text-xs cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-500" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onEdit(entry)}
                            disabled={isLocked || !canEdit}
                            className="gap-2 text-xs cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-500" />
                            Edit Log
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(entry.id)}
                            disabled={isLocked || !canDelete}
                            className="gap-2 text-xs cursor-pointer text-red-600 focus:text-red-600"
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
