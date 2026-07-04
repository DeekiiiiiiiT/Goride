import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import {
  Calendar, Clock, DollarSign, MapPin, Car, User, Hash, CreditCard,
  FileText, Tag, Navigation, Timer, CheckCircle2, AlertTriangle, X, Route,
} from "lucide-react";
import { Claim, Trip } from "../../types/data";
import { getClaimPeriodLabel } from "./ResolvedHistoryList";
import { normalizePlatform } from '../../utils/normalizePlatform';

interface ResolutionConfig {
  label: string;
  color: string;
  border: string;
  desc: string;
}

function getResolutionConfig(reason?: string): ResolutionConfig {
  switch (reason) {
    case 'Reimbursed':
      return {
        label: 'Reimbursed',
        color: 'bg-emerald-500',
        border: 'border-emerald-500',
        desc: 'The platform paid the missing toll amount — no further action needed.',
      };
    case 'Charge Driver':
      return {
        label: 'Charged to Driver',
        color: 'bg-orange-500',
        border: 'border-orange-500',
        desc: 'The shortfall was billed to the driver as a debit on their Expenses/Settlement/Cash Wallet.',
      };
    case 'Write Off':
      return {
        label: 'Written Off',
        color: 'bg-blue-500',
        border: 'border-blue-500',
        desc: 'The fleet absorbed this shortfall as a loss — no driver or platform recovery.',
      };
    default:
      return {
        label: reason || 'Unresolved',
        color: 'bg-slate-500',
        border: 'border-slate-300',
        desc: 'No resolution recorded for this claim.',
      };
  }
}

function finiteNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Legacy Charge Driver / write-off claims often omit expectedAmount & paidAmount. */
function resolveClaimFinancials(claim: Claim) {
  const shortfall = finiteNumber(claim.amount) ?? 0;
  const expected = finiteNumber(claim.expectedAmount) ?? shortfall;
  const paid = finiteNumber(claim.paidAmount) ?? Math.max(0, expected - shortfall);
  return { expected, paid, shortfall };
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDateTime(iso?: string) {
  if (!iso) return { date: 'N/A', time: 'N/A' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: iso, time: '' };
  return {
    date: d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
  };
}

interface ClaimDetailOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  claim: Claim | null;
  trip?: Trip | null;
  getDriverName?: (id: string) => string;
}

export function ClaimDetailOverlay({ isOpen, onClose, claim, trip, getDriverName }: ClaimDetailOverlayProps) {
  if (!claim) return null;

  const config = getResolutionConfig(claim.resolutionReason);
  const isChargeDriver = claim.resolutionReason === 'Charge Driver';
  // Charge applied only when a real debit projection transaction exists.
  const chargeApplied = isChargeDriver && !!claim.resolutionTransactionId;
  const { expected, paid, shortfall } = resolveClaimFinancials(claim);
  const driverLabel = claim.driverName || getDriverName?.(claim.driverId) || claim.driverId || 'Unknown Driver';
  const claimTypeLabel = (claim.type || 'Toll_Refund').replace(/_/g, ' ');
  const tollDateTime = formatDateTime(claim.date || claim.tripDate);
  const resolvedDateTime = formatDateTime(claim.updatedAt);
  const createdDateTime = formatDateTime(claim.createdAt);
  const tripDistance = finiteNumber(trip?.distance);
  const tripDuration = finiteNumber(trip?.duration);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0" aria-describedby="claim-detail-desc">
        <div className={`border-b-4 ${config.border} px-6 pt-6 pb-4`}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DialogTitle className="text-xl font-bold text-slate-900">Claim Detail</DialogTitle>
                <Badge className={`${config.color} text-white`}>{config.label}</Badge>
              </div>
              <span className={`text-2xl font-bold ${claim.resolutionReason === 'Write Off' ? 'text-red-600' : 'text-emerald-600'}`}>
                {claim.resolutionReason === 'Write Off' ? '-' : '+'}{formatMoney(shortfall)}
              </span>
            </div>
            <DialogDescription id="claim-detail-desc" className="text-sm text-slate-500 mt-1">
              {config.desc}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {isChargeDriver && (
            <div
              className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm ${
                chargeApplied
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              {chargeApplied ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <div>
                <span className="font-semibold">
                  {chargeApplied ? 'Charge applied' : 'Charge NOT yet applied'}
                </span>
                <p className="text-xs mt-0.5 opacity-90">
                  {chargeApplied
                    ? `A real debit transaction was posted to the driver's financials (ref ${claim.resolutionTransactionId}).`
                    : 'This claim is labeled "Charge Driver" but no debit has fired yet — reclassify to Write Off then back to Charge Driver to apply it.'}
                </p>
              </div>
            </div>
          )}

          <div>
            <SectionHeading icon={FileText} title="Claim Overview" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-lg p-4 border border-slate-100">
              <DetailRow icon={Calendar} label="Period" value={getClaimPeriodLabel(claim)} />
              <DetailRow icon={Calendar} label="Toll Date" value={tollDateTime.date} />
              <DetailRow icon={Clock} label="Date Resolved" value={`${resolvedDateTime.date} ${resolvedDateTime.time}`} />
              <DetailRow icon={Clock} label="Date Created" value={`${createdDateTime.date} ${createdDateTime.time}`} />
              <DetailRow icon={User} label="Driver" value={driverLabel} />
              <DetailRow icon={Car} label="Vehicle" value={claim.vehicleId || 'Unknown'} />
              <DetailRow icon={Tag} label="Claim Type" value={claimTypeLabel} />
              <DetailRow icon={CreditCard} label="Status" value={claim.status || 'Unknown'} />
            </div>
          </div>

          <div>
            <SectionHeading icon={DollarSign} title="Financial Breakdown" />
            <div className="grid grid-cols-3 gap-x-6 gap-y-3 bg-white rounded-lg p-4 border border-slate-200">
              <DetailRow icon={DollarSign} label="Toll Cost" value={formatMoney(expected)} />
              <DetailRow icon={DollarSign} label="Platform Paid" value={formatMoney(paid)} valueColor="text-emerald-600 font-semibold" />
              <DetailRow icon={DollarSign} label="Shortfall Claimed" value={formatMoney(shortfall)} valueColor="text-orange-600 font-semibold" />
            </div>
          </div>

          {trip && (
            <div>
              <SectionHeading icon={Navigation} title="Matched Trip" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-emerald-50/40 rounded-lg p-4 border border-emerald-100">
                <DetailRow icon={Tag} label="Platform" value={normalizePlatform(trip.platform)} valueColor="text-emerald-700" />
                <DetailRow icon={DollarSign} label="Toll Refund (Trip)" value={formatMoney(finiteNumber(trip.tollCharges) ?? 0)} />
                {(claim.pickup || trip.pickupLocation) && (
                  <div className="col-span-2">
                    <DetailRow icon={MapPin} label="Pickup" value={claim.pickup || trip.pickupLocation || ''} />
                  </div>
                )}
                {(claim.dropoff || trip.dropoffLocation) && (
                  <div className="col-span-2">
                    <DetailRow icon={MapPin} label="Dropoff" value={claim.dropoff || trip.dropoffLocation || ''} />
                  </div>
                )}
                {tripDistance != null && <DetailRow icon={Route} label="Distance" value={`${tripDistance.toFixed(1)} km`} />}
                {tripDuration != null && <DetailRow icon={Timer} label="Duration" value={`${tripDuration} min`} />}
              </div>
            </div>
          )}

          {(claim.subject || claim.message) && (
            <div>
              <SectionHeading icon={FileText} title="Dispute Message" />
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 space-y-2">
                {claim.subject && <p className="text-sm font-medium text-slate-800">{claim.subject}</p>}
                {claim.message && (
                  <p className="text-xs text-slate-500 whitespace-pre-wrap max-h-32 overflow-y-auto">{claim.message}</p>
                )}
              </div>
            </div>
          )}

          <div>
            <SectionHeading icon={Hash} title="Reference IDs" />
            <div className="grid grid-cols-1 gap-1.5 bg-slate-50 rounded-lg p-4 border border-slate-100 font-mono text-[11px] text-slate-500">
              <div>Claim ID: {claim.id}</div>
              {claim.transactionId && <div>Toll (transaction) ID: {claim.transactionId}</div>}
              {claim.tripId && <div>Trip ID: {claim.tripId}</div>}
              {claim.resolutionTransactionId && <div>Charge transaction ID: {claim.resolutionTransactionId}</div>}
              {claim.disputeRefundId && <div>Dispute refund ID: {claim.disputeRefundId}</div>}
            </div>
          </div>

          <Separator />

          <div className="flex items-center">
            <Button variant="ghost" onClick={onClose} className="ml-auto text-slate-400">
              <X className="h-4 w-4 mr-2" /> Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" /> {title}
    </h3>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  valueColor = 'text-slate-800',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{label}</div>
        <div className={`text-sm ${valueColor} truncate`}>{value}</div>
      </div>
    </div>
  );
}
