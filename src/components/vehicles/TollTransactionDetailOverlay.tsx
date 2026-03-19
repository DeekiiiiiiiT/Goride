import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import {
  Clock, DollarSign, Car, User, Calendar,
  Hash, CreditCard, FileText, Tag, Info, CheckCircle2,
  AlertTriangle, MinusCircle, ArrowUpRight, ArrowDownLeft,
  Receipt, Layers, Route, Shield, Navigation, Package
} from "lucide-react";
import { FinancialTransaction, Trip, Claim } from "../../types/data";
import { formatInFleetTz, useFleetTimezone } from '../../utils/timezoneDisplay';
import { normalizePlatform } from '../../utils/normalizePlatform';

interface TollTransactionDetailOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: FinancialTransaction | null;
  trip?: Trip | null;
  claim?: Claim | null;
}

export function TollTransactionDetailOverlay({
  isOpen,
  onClose,
  transaction,
  trip,
  claim,
}: TollTransactionDetailOverlayProps) {
  if (!transaction) return null;

  const fleetTz = useFleetTimezone();
  const meta = transaction.metadata || {} as Record<string, any>;

  // --- Derive transaction type label ---
  const isTopUp = transaction.category === 'Toll Top-up' || transaction.description?.toLowerCase().includes('top-up');
  const isCashReceipt = transaction.receiptUrl || transaction.paymentMethod === 'Cash' || transaction.description?.toLowerCase().includes('receipt');
  const isUsage = transaction.category === 'Toll Usage';
  const isRefund = transaction.amount > 0 && !isTopUp;

  const getTypeInfo = () => {
    if (isTopUp) return { label: 'Top-up (Credit)', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: ArrowDownLeft };
    if (isUsage) return { label: 'Usage (Toll)', color: 'bg-slate-100 text-slate-700 border-slate-300', icon: MinusCircle };
    if (isCashReceipt) return { label: 'Cash Receipt', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: FileText };
    if (isRefund) return { label: 'Refund (Income)', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: ArrowDownLeft };
    return { label: 'Expense', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: ArrowUpRight };
  };

  const typeInfo = getTypeInfo();
  const TypeIcon = typeInfo.icon;

  // --- Date formatting ---
  const formatTxDate = () => {
    try {
      const timeStr = transaction.time || '12:00:00';
      const cleanTime = timeStr.length >= 5 ? timeStr : '12:00:00';
      const dateBase = transaction.date.includes('T') ? transaction.date.split('T')[0] : transaction.date;
      const combined = `${dateBase}T${cleanTime}`;
      const localDate = new Date(combined);
      if (!isNaN(localDate.getTime())) {
        return {
          date: formatInFleetTz(localDate, fleetTz, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
          time: formatInFleetTz(localDate, fleetTz, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
        };
      }
      const fallback = new Date(transaction.date);
      if (!isNaN(fallback.getTime())) {
        return {
          date: formatInFleetTz(fallback, fleetTz, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
          time: formatInFleetTz(fallback, fleetTz, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
        };
      }
      return { date: transaction.date, time: transaction.time || 'N/A' };
    } catch {
      return { date: transaction.date, time: transaction.time || 'N/A' };
    }
  };

  const txDate = formatTxDate();

  // --- Trip date formatting ---
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

  const tripDate = formatTripDate();

  // Reconciliation status
  const reconciliationLabel = transaction.isReconciled
    ? 'Reconciled'
    : (meta.reconciliationStatus || 'Unreconciled');

  const reconciliationColor = transaction.isReconciled
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : reconciliationLabel === 'Flagged'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-slate-50 text-slate-500 border-slate-200';

  // Import metadata
  const isImported = !!meta.imported;
  const importDate = meta.importDate ? new Date(meta.importDate) : null;

  // Linked trip info
  const linkedTrip = (transaction as any).linkedTrip;
  const tripPickup = trip?.pickupLocation || linkedTrip?.pickupLocation || 'N/A';
  const tripDropoff = trip?.dropoffLocation || linkedTrip?.dropoffLocation || 'N/A';
  const tripPlatform = trip?.platform || linkedTrip?.platform || 'Unknown';
  const tripFare = trip?.fare ?? trip?.amount ?? linkedTrip?.amount ?? null;
  const tripTollCharges = trip?.tollCharges ?? linkedTrip?.tollCharges ?? 0;

  // Detail row component
  const DetailRow = ({ icon: Icon, label, value, valueClass, mono }: {
    icon: React.ElementType;
    label: string;
    value: React.ReactNode;
    valueClass?: string;
    mono?: boolean;
  }) => (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 p-1.5 rounded-md bg-slate-50 border border-slate-100">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">{label}</div>
        <div className={`text-sm mt-0.5 ${mono ? 'font-mono' : ''} ${valueClass || 'text-slate-800'}`}>
          {value || <span className="text-slate-300 italic">Not available</span>}
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className={`px-6 pt-6 pb-4 ${
          isTopUp ? 'bg-gradient-to-b from-emerald-50/80 to-white' :
          isUsage ? 'bg-gradient-to-b from-slate-50/80 to-white' :
          isCashReceipt ? 'bg-gradient-to-b from-purple-50/80 to-white' :
          'bg-gradient-to-b from-amber-50/80 to-white'
        }`}>
          <DialogHeader className="space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={typeInfo.color}>
                  <TypeIcon className="h-3 w-3 mr-1" />
                  {typeInfo.label}
                </Badge>
                <Badge variant="outline" className={reconciliationColor}>
                  {transaction.isReconciled ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Info className="h-3 w-3 mr-1" />}
                  {reconciliationLabel}
                </Badge>
              </div>
            </div>
            <DialogTitle className="text-2xl font-bold tracking-tight">
              <span className={transaction.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                {transaction.amount < 0 ? '-' : '+'}${Math.abs(transaction.amount).toFixed(2)}
              </span>
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-sm">
              {transaction.category} &mdash; {transaction.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Date & Time */}
          <div className="py-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Date & Time</h3>
            <div className="grid grid-cols-2 gap-2">
              <DetailRow icon={Calendar} label="Date" value={txDate.date} />
              <DetailRow icon={Clock} label="Time" value={txDate.time} />
            </div>
          </div>

          <Separator />

          {/* Transaction Details */}
          <div className="py-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Transaction Details</h3>
            <div className="grid grid-cols-2 gap-x-4">
              <DetailRow icon={FileText} label="Category" value={transaction.category} />
              <DetailRow icon={CreditCard} label="Payment Method" value={transaction.paymentMethod} />
              <DetailRow icon={DollarSign} label="Amount" value={
                <span className={`font-bold ${transaction.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {transaction.amount < 0 ? '-' : '+'}${Math.abs(transaction.amount).toFixed(2)}
                </span>
              } />
              <DetailRow icon={Shield} label="Status" value={
                <Badge variant="outline" className={
                  transaction.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  transaction.status === 'Failed' ? 'bg-red-50 text-red-700 border-red-200' :
                  'bg-slate-50 text-slate-600 border-slate-200'
                }>
                  {transaction.status || 'Completed'}
                </Badge>
              } />
            </div>
            {transaction.description && (
              <DetailRow icon={FileText} label="Description" value={transaction.description} />
            )}
          </div>

          <Separator />

          {/* Vehicle & Driver */}
          <div className="py-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Vehicle & Driver</h3>
            <div className="grid grid-cols-2 gap-x-4">
              <DetailRow icon={Car} label="Vehicle" value={transaction.vehiclePlate || transaction.vehicleId} />
              <DetailRow icon={User} label="Driver" value={transaction.driverName || (transaction.driverId ? `ID: ${transaction.driverId}` : null)} />
            </div>
          </div>

          <Separator />

          {/* ═══ LINKED TRIP ═══ */}
          <div className="py-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Route className="h-3.5 w-3.5 text-blue-500" />
              Linked Trip
            </h3>
            {transaction.tripId ? (
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 space-y-4">
                {/* Route visualization */}
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center mt-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                    <div className="w-0.5 h-8 bg-slate-300" />
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-100" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Pickup</span>
                      <p className="text-sm text-slate-800 font-medium leading-tight">{tripPickup}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Dropoff</span>
                      <p className="text-sm text-slate-800 font-medium leading-tight">{tripDropoff}</p>
                    </div>
                  </div>
                </div>

                {/* Trip details grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <DetailRow icon={Layers} label="Platform" value={normalizePlatform(tripPlatform)} />
                  {tripFare != null && (
                    <DetailRow icon={DollarSign} label="Fare" value={`$${Math.abs(Number(tripFare)).toFixed(2)}`} />
                  )}
                  {tripDate && <DetailRow icon={Calendar} label="Trip Date" value={tripDate.date} />}
                  {tripDate && <DetailRow icon={Clock} label="Pickup Time" value={tripDate.time} />}
                  {tripDate && <DetailRow icon={Clock} label="Dropoff Time" value={tripDate.dropoff} />}
                  <DetailRow
                    icon={DollarSign}
                    label="Toll Reimbursement"
                    value={`$${Number(tripTollCharges).toFixed(2)}`}
                    valueClass={tripTollCharges > 0 ? 'font-semibold text-emerald-600' : ''}
                  />
                </div>

                {/* Trip ID */}
                <div className="text-[10px] text-slate-400 font-mono truncate pt-1 border-t border-blue-100">
                  Trip ID: {transaction.tripId}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-sm text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200 p-4">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>
                  {isUsage
                    ? 'Not matched to any trip \u2014 appears as personal or unmatched usage.'
                    : 'No linked trip for this transaction.'}
                </span>
              </div>
            )}
          </div>

          <Separator />

          {/* Reference & Import Info */}
          <div className="py-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reference & Import</h3>
            <div className="grid grid-cols-2 gap-x-4">
              {transaction.referenceNumber && (
                <DetailRow icon={Hash} label="Reference #" value={transaction.referenceNumber} mono />
              )}
              {meta.referenceNumber && !transaction.referenceNumber && (
                <DetailRow icon={Hash} label="Reference #" value={meta.referenceNumber} mono />
              )}
              <DetailRow icon={Hash} label="Transaction ID" value={
                <span className="truncate block max-w-[180px]" title={transaction.id}>{transaction.id.slice(0, 12)}...</span>
              } mono />
              {transaction.batchId && (
                <DetailRow icon={Layers} label="Batch ID" value={
                  <span className="truncate block max-w-[180px]" title={transaction.batchId}>{transaction.batchId.slice(0, 12)}...</span>
                } mono />
              )}
              {transaction.batchName && (
                <DetailRow icon={Package} label="Batch Name" value={transaction.batchName} />
              )}
            </div>
            {isImported && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50/80 rounded-md border border-slate-100 px-3 py-2">
                <Receipt className="h-3 w-3" />
                <span>Imported on {importDate ? formatInFleetTz(importDate, fleetTz, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : 'Unknown date'}</span>
              </div>
            )}
          </div>

          {/* Top-up specific info */}
          {isTopUp && meta.discount !== undefined && (
            <>
              <Separator />
              <div className="py-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Top-up Details</h3>
                <div className="grid grid-cols-2 gap-x-4">
                  {meta.discount > 0 && (
                    <DetailRow icon={DollarSign} label="Discount" value={`-$${Number(meta.discount).toFixed(2)}`} valueClass="text-emerald-600" />
                  )}
                  {meta.paymentAfterDiscount > 0 && (
                    <DetailRow icon={DollarSign} label="Net Paid" value={`$${Number(meta.paymentAfterDiscount).toFixed(2)}`} />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Original Type (if type was remapped during import) */}
          {meta.originalType && meta.originalType !== transaction.type && (
            <>
              <Separator />
              <div className="py-3">
                <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-50/80 rounded-md border border-slate-100 px-3 py-2">
                  <Info className="h-3 w-3" />
                  <span>Original type: <strong>{meta.originalType}</strong> (remapped to <strong>{transaction.type}</strong> during import)</span>
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          {transaction.notes && (
            <>
              <Separator />
              <div className="py-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</h3>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-lg border p-3">{transaction.notes}</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
