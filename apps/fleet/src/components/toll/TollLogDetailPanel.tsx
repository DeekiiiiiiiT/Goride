import React, { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../ui/sheet';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import {
  Receipt,
  Car,
  MapPin,
  FileText,
  ExternalLink,
  AlertTriangle,
  GitMerge,
  Pencil,
  Clock,
  CreditCard,
  User,
  Tag,
  Navigation,
  Globe,
  Hash,
  CalendarDays,
  Loader2,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { TollLogEntry } from '../../types/tollLog';
import { Trip } from '../../types/data';
import { api } from '../../services/api';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TollLogDetailPanelProps {
  log: TollLogEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onFlagDisputed?: (log: TollLogEntry) => void;
  onOpenReconciliation?: (log: TollLogEntry) => void;
}

// ---------------------------------------------------------------------------
// Section / DetailRow helpers — mirrors TollPlazaDetailPanel pattern
// ---------------------------------------------------------------------------

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          {title}
        </h4>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex justify-between items-start gap-2 ${className || ''}`}>
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span
        className={`text-xs font-medium text-slate-800 dark:text-slate-200 text-right ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value || '—'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, 'dd MMM yyyy') : iso;
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string | null | undefined, time: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = parseISO(iso);
    const datePart = isValid(d) ? format(d, 'dd MMM yyyy') : iso;
    const timePart = time ? time.slice(0, 5) : '';
    return timePart ? `${datePart} at ${timePart}` : datePart;
  } catch {
    return iso;
  }
}

function fmtJMD(value: number): string {
  return value.toLocaleString('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function statusBadge(status: string) {
  switch (status) {
    case 'Completed':
    case 'Approved':
    case 'Verified':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
    case 'Pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800';
    case 'Flagged':
    case 'Rejected':
    case 'Failed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800';
    case 'Reconciled':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    default:
      return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  }
}

function paymentBadge(method: string) {
  switch (method) {
    case 'E-Tag':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'Cash':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'Card':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    default:
      return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  }
}

function typeBadge(isUsage: boolean) {
  return isUsage
    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TollLogDetailPanel({
  log,
  isOpen,
  onClose,
  onFlagDisputed,
  onOpenReconciliation,
}: TollLogDetailPanelProps) {
  const [linkedTrip, setLinkedTrip] = useState<Trip | null>(null);
  const [tripLoading, setTripLoading] = useState(false);

  // Fetch the linked trip when the panel opens with a tripId
  useEffect(() => {
    setLinkedTrip(null);
    if (!log?.tripId) return;

    let cancelled = false;
    (async () => {
      setTripLoading(true);
      try {
        const trips = await api.getTrips();
        const found = (trips || []).find((t: Trip) => t.id === log.tripId);
        if (!cancelled && found) setLinkedTrip(found);
      } catch (err) {
        console.error('[TollLogDetail] Failed to fetch linked trip:', err);
      } finally {
        if (!cancelled) setTripLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [log?.tripId]);

  if (!log) return null;

  const raw = log._raw;
  const hasPlaza = !!log.plazaId;
  const hasTrip = !!log.tripId;

  // Google Maps link from plaza coordinates (read from _raw.metadata or from the matched plaza's location)
  const lat = raw.metadata?.lat ?? raw.metadata?.latitude;
  const lng = raw.metadata?.lng ?? raw.metadata?.longitude;
  const hasCoords = lat != null && lng != null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto p-0 flex flex-col"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <SheetHeader className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate pr-6">
                Toll Transaction
              </SheetTitle>
              <SheetDescription className="sr-only">
                Detail panel for toll transaction {log.id}
              </SheetDescription>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="outline" className={statusBadge(log.statusDisplay)}>
                  {log.statusDisplay}
                </Badge>
                <Badge variant="outline" className={typeBadge(log.isUsage)}>
                  {log.typeLabel}
                </Badge>
                {log.referenceNumber && (
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                    #{log.referenceNumber}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Large amount display */}
          <div className="mt-4 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${
                log.isUsage
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {log.isUsage ? '-' : '+'}{fmtJMD(log.absAmount)}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">JMD</span>
          </div>
        </SheetHeader>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Section 1: Transaction Details */}
          <Section title="Transaction Details" icon={<Receipt className="h-3.5 w-3.5 text-indigo-500" />}>
            <DetailRow label="Date & Time" value={
              <span className="flex items-center gap-2">
                {fmtDateTime(log.date, log.time)}
                {new Date(log.date) > new Date() && (
                  <span className="text-[10px] font-medium text-red-500 bg-red-50 dark:bg-red-900/20 px-1 py-0.5 rounded">Future Date</span>
                )}
              </span>
            } />
            <DetailRow label="Type" value={
              <Badge variant="outline" className={`${typeBadge(log.isUsage)} text-[10px] px-1.5 py-0`}>
                {log.typeLabel}
              </Badge>
            } />
            <DetailRow label="Payment" value={
              <Badge variant="outline" className={`${paymentBadge(log.paymentMethodDisplay)} text-[10px] px-1.5 py-0`}>
                {log.paymentMethodDisplay}
              </Badge>
            } />
            <DetailRow label="Category" value={raw.category || '—'} />
            <DetailRow label="Description" value={log.description || '—'} />
            {log.referenceNumber && (
              <DetailRow label="Reference #" value={log.referenceNumber} mono />
            )}
          </Section>

          <Separator />

          {/* Section 2: Vehicle & Driver */}
          <Section title="Vehicle & Driver" icon={<Car className="h-3.5 w-3.5 text-indigo-500" />}>
            <DetailRow label="Vehicle" value={log.vehicleName} />
            <DetailRow label="Driver" value={log.driverDisplayName} />
            {log.tollTagId && (
              <DetailRow
                label="Tag ID"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Tag className="h-3 w-3 text-blue-500" />
                    {log.tollTagId}
                  </span>
                }
                mono
              />
            )}
          </Section>

          {/* Section 3: Plaza Information (if matched) */}
          {hasPlaza && (
            <>
              <Separator />
              <Section title="Plaza Information" icon={<MapPin className="h-3.5 w-3.5 text-indigo-500" />}>
                <DetailRow label="Plaza" value={log.plazaName} />
                <DetailRow label="Highway" value={log.highway} />
                {log.direction && <DetailRow label="Direction" value={log.direction} />}
                {log.parish && <DetailRow label="Parish" value={log.parish} />}
                {hasCoords && (
                  <DetailRow
                    label="GPS"
                    value={`${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`}
                    mono
                  />
                )}
                {hasCoords && (
                  <a
                    href={`https://www.google.com/maps?q=${lat},${lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1"
                  >
                    <Globe className="h-3 w-3" />
                    Open in Google Maps
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </Section>
            </>
          )}

          {/* If NOT matched — show raw location */}
          {!hasPlaza && log.locationRaw && (
            <>
              <Separator />
              <Section title="Location (Unmatched)" icon={<MapPin className="h-3.5 w-3.5 text-amber-500" />}>
                <DetailRow label="Vendor / Description" value={log.locationRaw} />
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0.5 font-normal text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700 mt-1"
                >
                  No plaza match found
                </Badge>
              </Section>
            </>
          )}

          {/* Section 4: Linked Trip */}
          {hasTrip && (
            <>
              <Separator />
              <Section title="Linked Trip" icon={<Navigation className="h-3.5 w-3.5 text-indigo-500" />}>
                {tripLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                    <span className="text-xs text-slate-400">Loading trip…</span>
                  </div>
                ) : linkedTrip ? (
                  <>
                    <DetailRow label="Trip ID" value={linkedTrip.id.slice(0, 8) + '…'} mono />
                    <DetailRow label="Platform" value={
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {linkedTrip.platform}
                      </Badge>
                    } />
                    <DetailRow label="Trip Date" value={fmtDate(linkedTrip.date)} />
                    {linkedTrip.pickupLocation && (
                      <DetailRow label="Pickup" value={linkedTrip.pickupLocation} />
                    )}
                    {linkedTrip.dropoffLocation && (
                      <DetailRow label="Dropoff" value={linkedTrip.dropoffLocation} />
                    )}
                    <DetailRow
                      label="Trip Amount"
                      value={
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {fmtJMD(linkedTrip.amount)}
                        </span>
                      }
                    />
                  </>
                ) : (
                  <DetailRow label="Trip ID" value={
                    <span className="text-xs text-slate-400">
                      {log.tripId!.slice(0, 8)}… <span className="italic">(not found)</span>
                    </span>
                  } />
                )}
              </Section>
            </>
          )}

          <Separator />

          {/* Section 5: Audit Trail */}
          <Section title="Audit Trail" icon={<FileText className="h-3.5 w-3.5 text-slate-400" />}>
            <DetailRow
              label="Reconciled"
              value={
                log.isReconciled ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                    Yes
                  </Badge>
                ) : (
                  <span className="text-xs text-slate-400">No</span>
                )
              }
            />
            {log.batchId && (
              <DetailRow label="Batch ID" value={log.batchId.slice(0, 12) + '…'} mono />
            )}
            {raw.processedDate && (
              <DetailRow label="Processed" value={fmtDate(raw.processedDate)} />
            )}
            {log.notes && (
              <div className="mt-2">
                <span className="text-xs text-slate-500 block mb-1">Notes</span>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-md p-2.5 border border-slate-100 dark:border-slate-700">
                  {log.notes}
                </p>
              </div>
            )}
          </Section>
        </div>

        {/* ── Footer actions ──────────────────────────────────────────── */}
        <SheetFooter className="border-t border-slate-100 dark:border-slate-800 p-4 flex-row gap-2 justify-start">
          {onFlagDisputed && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/20"
              onClick={() => onFlagDisputed(log)}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Flag Disputed
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/20"
            onClick={() => onOpenReconciliation?.(log)}
            disabled={!onOpenReconciliation}
          >
            <GitMerge className="h-3.5 w-3.5" />
            Reconciliation
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}