import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../ui/dialog";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Separator } from "../../ui/separator";
import {
  Clock, DollarSign, MapPin, Car, User, ArrowRight, Calendar,
  Hash, CreditCard, FileText, Tag, Bot, UserCheck, Undo2,
  TrendingUp, TrendingDown, Shield, Info, CheckCircle2,
  AlertTriangle, Navigation, Route, Loader2, Layers, Receipt
} from "lucide-react";
import { FinancialTransaction, Trip, Claim } from "../../../types/data";
import { TollFinancials, calculateTollFinancials } from "../../../utils/tollReconciliation";
import { normalizePlatform } from '../../../utils/normalizePlatform';
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';

interface MatchedTollDetailOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: FinancialTransaction | null;
  trip: Trip | null;
  claim: Claim | null;
  onUnmatch?: (tx: FinancialTransaction) => void;
}

export function MatchedTollDetailOverlay({
  isOpen,
  onClose,
  transaction,
  trip,
  claim,
  onUnmatch,
}: MatchedTollDetailOverlayProps) {
  if (!transaction) return null;

  const fleetTz = useFleetTimezone();
  const meta = (transaction as any).metadata || {};
  const financials = calculateTollFinancials(transaction, trip || undefined, claim || undefined);
  const isAuto = meta.reconciledBy === 'system-auto';

  // --- Date Helpers ---
  const formatTxDate = () => {
    try {
      const timeStr = transaction.time || '12:00:00';
      const cleanTime = timeStr.length >= 5 ? timeStr : '12:00:00';
      const combined = `${transaction.date}T${cleanTime}`;
      const localDate = new Date(combined);
      if (!isNaN(localDate.getTime())) {
        return {
          date: formatInFleetTz(localDate, fleetTz, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
          time: formatInFleetTz(localDate, fleetTz, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
        };
      }
      return { date: transaction.date, time: transaction.time || 'N/A' };
    } catch {
      return { date: transaction.date, time: transaction.time || 'N/A' };
    }
  };

  const formatTripDate = () => {
    if (!trip) return null;
    try {
      const pickupSource = trip.requestTime || trip.date;
      const d = new Date(pickupSource);
      return {
        date: formatInFleetTz(d, fleetTz, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        time: trip.requestTime
          ? formatInFleetTz(d, fleetTz, { hour: 'numeric', minute: '2-digit', hour12: true })
          : 'N/A',
        dropoff: trip.dropoffTime
          ? formatInFleetTz(new Date(trip.dropoffTime), fleetTz, { hour: 'numeric', minute: '2-digit', hour12: true })
          : 'N/A',
      };
    } catch {
      return { date: trip.date, time: 'N/A', dropoff: 'N/A' };
    }
  };

  const txDate = formatTxDate();
  const tripDate = formatTripDate();

  const reconciledAt = meta.reconciledAt
    ? (() => {
        try {
          return formatInFleetTz(new Date(meta.reconciledAt), fleetTz, {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
          });
        } catch { return meta.reconciledAt; }
      })()
    : null;

  // --- Financial status ---
  const getStatusConfig = () => {
    if (financials.netLoss <= 0) {
      return { label: 'Fully Recovered', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle2 };
    }
    if (financials.totalRecovered > 0) {
      return { label: 'Partial Loss', color: 'bg-amber-100 text-amber-800 border-amber-300', icon: AlertTriangle };
    }
    return { label: 'Full Loss', color: 'bg-rose-100 text-rose-800 border-rose-300', icon: TrendingDown };
  };
  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  // Linked trip info (from server enrichment or trips prop)
  const linkedTrip = (transaction as any).linkedTrip;
  const tripPickup = trip?.pickupLocation || linkedTrip?.pickupLocation || 'N/A';
  const tripDropoff = trip?.dropoffLocation || linkedTrip?.dropoffLocation || 'N/A';
  const tripPlatform = trip?.platform || linkedTrip?.platform || 'Unknown';
  const tripFare = trip?.amount ?? linkedTrip?.amount ?? null;
  const tripTollCharges = trip?.tollCharges ?? linkedTrip?.tollCharges ?? 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" aria-describedby="matched-toll-detail-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-slate-600" />
            Matched Toll Detail
          </DialogTitle>
          <DialogDescription id="matched-toll-detail-desc">
            Full audit record for this reconciled toll transaction.
          </DialogDescription>
        </DialogHeader>

        {/* Match Source Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isAuto ? (
              <Badge className="bg-indigo-100 text-indigo-700 border-indigo-300 gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                Auto-Matched
              </Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-600 border-slate-300 gap-1.5">
                <UserCheck className="h-3.5 w-3.5" />
                Manually Matched
              </Badge>
            )}
            {meta.autoMatchScore != null && (
              <Badge variant="outline" className={`text-xs ${
                meta.autoMatchScore >= 80 ? 'text-emerald-700 border-emerald-300 bg-emerald-50' :
                meta.autoMatchScore >= 50 ? 'text-amber-700 border-amber-300 bg-amber-50' :
                'text-rose-700 border-rose-300 bg-rose-50'
              }`}>
                Score: {meta.autoMatchScore}/100
              </Badge>
            )}
          </div>
          <Badge variant="outline" className={`gap-1 ${statusConfig.color}`}>
            <StatusIcon className="h-3 w-3" />
            {statusConfig.label}
          </Badge>
        </div>

        <Separator />

        {/* ═══ TOLL TRANSACTION ═══ */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-rose-500" />
            Toll Transaction
          </h4>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-slate-50 rounded-lg p-3">
            <DetailRow icon={Calendar} label="Date" value={txDate.date} />
            <DetailRow icon={Clock} label="Time" value={txDate.time} />
            <DetailRow icon={DollarSign} label="Amount" value={`$${Math.abs(transaction.amount).toFixed(2)}`} valueClass="font-bold text-rose-600" />
            <DetailRow icon={FileText} label="Description" value={transaction.description || 'Toll Charge'} />
            <DetailRow icon={Tag} label="Tag ID" value={meta.tollTagId || 'N/A'} mono />
            <DetailRow icon={CreditCard} label="Payment" value={transaction.paymentMethod || 'Tag Balance'} />
            <DetailRow icon={Car} label="Vehicle" value={transaction.vehiclePlate || 'N/A'} />
            <DetailRow icon={User} label="Driver" value={transaction.driverName || 'N/A'} />
            {transaction.referenceNumber && (
              <DetailRow icon={Hash} label="Reference" value={transaction.referenceNumber} mono />
            )}
            {meta.laneId && (
              <DetailRow icon={Navigation} label="Lane" value={meta.laneId} />
            )}
          </div>
        </div>

        <Separator />

        {/* ═══ LINKED TRIP ═══ */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <Route className="h-4 w-4 text-blue-500" />
            Linked Trip
          </h4>
          {transaction.tripId ? (
            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 space-y-3">
              {/* Route */}
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center mt-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <div className="w-0.5 h-6 bg-slate-300" />
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Pickup</span>
                    <p className="text-sm text-slate-800 font-medium">{tripPickup}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Dropoff</span>
                    <p className="text-sm text-slate-800 font-medium">{tripDropoff}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <DetailRow icon={Layers} label="Platform" value={normalizePlatform(tripPlatform)} />
                {tripDate && <DetailRow icon={Calendar} label="Trip Date" value={tripDate.date} />}
                {tripDate && <DetailRow icon={Clock} label="Pickup Time" value={tripDate.time} />}
                {tripDate && <DetailRow icon={Clock} label="Dropoff Time" value={tripDate.dropoff} />}
                {tripFare != null && (
                  <DetailRow icon={DollarSign} label="Fare" value={`$${Math.abs(Number(tripFare)).toFixed(2)}`} />
                )}
                <DetailRow icon={DollarSign} label="Toll Reimbursement" value={`$${Number(tripTollCharges).toFixed(2)}`} valueClass={tripTollCharges > 0 ? 'font-semibold text-emerald-600' : ''} />
              </div>

              <div className="text-[10px] text-slate-400 font-mono truncate">
                Trip ID: {transaction.tripId}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 italic p-3 bg-slate-50 rounded-lg">
              No trip data available.
            </div>
          )}
        </div>

        <Separator />

        {/* ═══ FINANCIAL ANALYSIS ═══ */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            Financial Analysis
          </h4>
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <FinancialRow label="Toll Cost" value={`-$${financials.cost.toFixed(2)}`} valueClass="text-rose-600 font-bold" />
            <FinancialRow label="Platform Reimbursement" value={financials.platformRefund > 0 ? `+$${financials.platformRefund.toFixed(2)}` : '$0.00'} valueClass={financials.platformRefund > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-400'} />
            <FinancialRow label="Driver Recovery (Claims)" value={financials.driverRecovered > 0 ? `+$${financials.driverRecovered.toFixed(2)}` : '$0.00'} valueClass={financials.driverRecovered > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-400'} />
            {financials.fleetAbsorbed > 0 && (
              <FinancialRow label="Fleet Absorbed (Write-off)" value={`$${financials.fleetAbsorbed.toFixed(2)}`} valueClass="text-amber-600" />
            )}
            <Separator className="my-1" />
            <FinancialRow
              label="Total Recovered"
              value={`$${financials.totalRecovered.toFixed(2)}`}
              valueClass="font-bold text-emerald-700"
              bold
            />
            <FinancialRow
              label="Net Loss"
              value={financials.netLoss > 0 ? `-$${financials.netLoss.toFixed(2)}` : '$0.00'}
              valueClass={`font-bold ${financials.netLoss > 0 ? 'text-rose-600' : 'text-slate-400'}`}
              bold
            />
            {/* Variance indicator */}
            {financials.platformRefund > financials.cost && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded mt-1">
                <TrendingUp className="h-3 w-3" />
                Reimbursed ${(financials.platformRefund - financials.cost).toFixed(2)} <em>more</em> than toll cost (positive variance)
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* ═══ MATCH METADATA ═══ */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-slate-400" />
            Match Details
          </h4>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-slate-50 rounded-lg p-3">
            <DetailRow icon={Shield} label="Matched By" value={isAuto ? 'System (Auto)' : (meta.reconciledBy || 'Admin (Manual)')} />
            {reconciledAt && <DetailRow icon={Calendar} label="Matched On" value={reconciledAt} />}
            {meta.autoMatchReason && <DetailRow icon={FileText} label="Match Reason" value={meta.autoMatchReason} />}
            {meta.autoMatchScore != null && <DetailRow icon={TrendingUp} label="Confidence" value={`${meta.autoMatchScore}/100`} />}
            {meta.matchedTripPlatform && <DetailRow icon={Layers} label="Trip Platform" value={normalizePlatform(meta.matchedTripPlatform)} />}
            {meta.tollAmount != null && <DetailRow icon={DollarSign} label="Toll Amount (at match)" value={`$${Number(meta.tollAmount).toFixed(2)}`} />}
            {meta.tripTollCharges != null && <DetailRow icon={DollarSign} label="Trip Toll Charges" value={`$${Number(meta.tripTollCharges).toFixed(2)}`} />}
            {transaction.batchId && <DetailRow icon={Layers} label="Import Batch" value={(transaction as any).batchName || transaction.batchId.substring(0, 8)} />}
          </div>
        </div>

        {/* Claim info if exists */}
        {claim && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-purple-500" />
                Related Claim
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-purple-50/50 border border-purple-100 rounded-lg p-3">
                <DetailRow icon={DollarSign} label="Claim Amount" value={`$${claim.amount.toFixed(2)}`} />
                <DetailRow icon={Info} label="Status" value={claim.status} />
                {claim.resolutionReason && <DetailRow icon={FileText} label="Resolution" value={claim.resolutionReason} />}
              </div>
            </div>
          </>
        )}

        {/* Transaction ID */}
        <div className="text-[10px] text-slate-300 font-mono truncate pt-1">
          TX: {transaction.id}
        </div>

        {/* Actions */}
        {onUnmatch && (
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onUnmatch(transaction);
                onClose();
              }}
              className="gap-1.5"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Unmatch
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Small helper components ---

function DetailRow({
  icon: Icon,
  label,
  value,
  valueClass = '',
  mono = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueClass?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">{label}</span>
        <span className={`text-sm text-slate-700 block truncate ${mono ? 'font-mono text-xs' : ''} ${valueClass}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

function FinancialRow({
  label,
  value,
  valueClass = '',
  bold = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-semibold' : ''}`}>
      <span className={`text-sm ${bold ? 'text-slate-900' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-sm ${valueClass}`}>{value}</span>
    </div>
  );
}
