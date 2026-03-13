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
  Clock, DollarSign, MapPin, Camera, Car, User, Gauge, AlertTriangle,
  Check, X, ArrowRight, Calendar, Hash, CreditCard, FileText, Tag,
  Navigation, Route, Timer, Zap, Shield, Info
} from "lucide-react";
import { FinancialTransaction, Trip } from "../../../types/data";
import { MatchResult, MatchType } from "../../../utils/tollReconciliation";
import { normalizePlatform } from '../../../utils/normalizePlatform';
import { format } from "date-fns";

interface TollDetailOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: FinancialTransaction | null;
  match: MatchResult | null;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onFlag?: () => void;
}

export function TollDetailOverlay({
  isOpen,
  onClose,
  transaction,
  match,
  onConfirm,
  onDismiss,
  onApprove,
  onReject,
  onFlag,
}: TollDetailOverlayProps) {
  if (!transaction) return null;

  const trip = match?.trip;
  const isClaim = transaction.paymentMethod === 'Cash' || !!transaction.receiptUrl;

  // --- Helpers ---
  const formatTxDate = () => {
    try {
      const timeStr = transaction.time || '12:00:00';
      const cleanTime = timeStr.length >= 5 ? timeStr : '12:00:00';
      const localDate = new Date(`${transaction.date}T${cleanTime}`);
      if (!isNaN(localDate.getTime())) {
        return {
          date: format(localDate, 'EEEE, MMMM d, yyyy'),
          time: format(localDate, 'h:mm:ss a'),
        };
      }
      return { date: transaction.date, time: transaction.time || 'N/A' };
    } catch {
      return { date: transaction.date, time: transaction.time || 'N/A' };
    }
  };

  const formatTripDate = () => {
    if (!trip) return { date: 'N/A', time: 'N/A', dropoff: 'N/A' };
    try {
      // Use requestTime for pickup time (Phase 4 fix — was incorrectly using trip.date)
      const pickupSource = trip.requestTime || trip.date;
      const d = new Date(pickupSource);
      const hasRealPickupTime = !!trip.requestTime && trip.requestTime !== trip.date;
      return {
        date: format(d, 'EEEE, MMMM d, yyyy'),
        time: hasRealPickupTime ? format(d, 'h:mm:ss a') : 'N/A',
        dropoff: trip.dropoffTime ? format(new Date(trip.dropoffTime), 'h:mm a') : 'N/A',
      };
    } catch {
      return { date: trip.date, time: 'N/A', dropoff: 'N/A' };
    }
  };

  const getMatchConfig = (type?: MatchType) => {
    switch (type) {
      case 'PERFECT_MATCH':
        return { label: 'Reimbursed', color: 'bg-emerald-500', border: 'border-emerald-500', desc: 'This toll was incurred during an active trip and the platform reimbursed the full amount through the fare.' };
      case 'DEADHEAD_MATCH':
        return { label: 'Deadhead', color: 'bg-blue-500', border: 'border-blue-500', desc: 'This toll was incurred while the driver was en route to pick up a passenger. It is a legitimate business expense but typically not reimbursed by the platform.' };
      case 'AMOUNT_VARIANCE':
        return { label: 'Underpaid', color: 'bg-orange-500', border: 'border-orange-500', desc: 'This toll was incurred during an active trip, but the platform reimbursed less than the actual toll cost. The difference is a claimable loss.' };
      case 'PERSONAL_MATCH':
        return { label: 'Personal', color: 'bg-purple-500', border: 'border-purple-500', desc: 'This toll does not appear to be associated with any business trip. It was likely incurred during personal use of the vehicle.' };
      default:
        return { label: 'Unmatched', color: 'bg-slate-500', border: 'border-slate-300', desc: 'No matching trip was found for this toll charge.' };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return { bg: 'bg-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-100', label: 'Strong' };
    if (score >= 50) return { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-100', label: 'Moderate' };
    return { bg: 'bg-rose-500', text: 'text-rose-700', light: 'bg-rose-100', label: 'Weak' };
  };

  const getWindowLabel = (w?: string) => {
    switch (w) {
      case 'ON_TRIP': return { label: 'On Trip', icon: Navigation, color: 'text-emerald-600 bg-emerald-50' };
      case 'ENROUTE': return { label: 'En Route to Pickup', icon: Route, color: 'text-blue-600 bg-blue-50' };
      case 'POST_TRIP': return { label: 'Post Trip', icon: Timer, color: 'text-purple-600 bg-purple-50' };
      case 'NONE': return { label: 'Outside Windows', icon: AlertTriangle, color: 'text-rose-600 bg-rose-50' };
      default: return null;
    }
  };

  const txDate = formatTxDate();
  const tripDate = formatTripDate();
  const matchConfig = getMatchConfig(match?.matchType);

  const renderActionButtons = () => {
    if (!match) return null;

    if (isClaim) {
      if (match.matchType === 'AMOUNT_VARIANCE' && onFlag) {
        return (
          <Button onClick={onFlag} className="bg-amber-600 hover:bg-amber-700 flex-1">
            <Check className="h-4 w-4 mr-2" /> Flag for Claim
          </Button>
        );
      }
      if (match.matchType === 'PERSONAL_MATCH' && onReject) {
        return (
          <Button onClick={onReject} className="bg-rose-600 hover:bg-rose-700 flex-1">
            <X className="h-4 w-4 mr-2" /> Reject Claim
          </Button>
        );
      }
      if (onApprove) {
        return (
          <Button onClick={onApprove} className="bg-emerald-600 hover:bg-emerald-700 flex-1">
            <Check className="h-4 w-4 mr-2" /> Approve Reimbursement
          </Button>
        );
      }
    }

    const label = match.matchType === 'PERSONAL_MATCH' ? 'Mark Personal' : 'Link Trip';
    return (
      <Button onClick={onConfirm} className="bg-emerald-600 hover:bg-emerald-700 flex-1">
        <Check className="h-4 w-4 mr-2" /> {label}
      </Button>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0" aria-describedby="toll-detail-desc">
        {/* Header with match type color bar */}
        <div className={`border-b-4 ${matchConfig.border} px-6 pt-6 pb-4`}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DialogTitle className="text-xl font-bold text-slate-900">Toll Detail</DialogTitle>
                <Badge className={`${matchConfig.color} text-white`}>{matchConfig.label}</Badge>
              </div>
              <span className="text-2xl font-bold text-rose-600">
                -${Math.abs(transaction.amount).toFixed(2)}
              </span>
            </div>
            <DialogDescription id="toll-detail-desc" className="text-sm text-slate-500 mt-1">{matchConfig.desc}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5">

          {/* SECTION 1: Toll Transaction Details */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Toll Transaction
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-lg p-4 border border-slate-100">
              <DetailRow icon={Calendar} label="Date" value={txDate.date} />
              <DetailRow icon={Clock} label="Time" value={txDate.time} />
              <DetailRow icon={Car} label="Vehicle" value={transaction.vehiclePlate || transaction.vehicleId || 'Unknown'} />
              <DetailRow icon={User} label="Driver" value={transaction.driverName || 'Unknown'} />
              <DetailRow icon={FileText} label="Description" value={transaction.description || 'Toll Usage'} />
              <DetailRow icon={CreditCard} label="Payment" value={isClaim ? 'Cash / Receipt' : 'Tag Import'} />
              {transaction.referenceNumber && (
                <DetailRow icon={Hash} label="Reference" value={transaction.referenceNumber} />
              )}
              {transaction.receiptUrl && (
                <div className="col-span-2">
                  <a
                    href={transaction.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    View Receipt
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: Match Analysis */}
          {match && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> Match Analysis
              </h3>
              <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-4">

                {/* Confidence Score Bar */}
                {match.confidenceScore != null && (() => {
                  const sc = getScoreColor(match.confidenceScore);
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                          <Gauge className="h-4 w-4 text-slate-400" />
                          Confidence Score
                        </span>
                        <span className={`text-sm font-bold ${sc.text}`}>
                          {match.confidenceScore}/100 ({sc.label})
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${sc.bg} transition-all duration-500`}
                          style={{ width: `${match.confidenceScore}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Indicator Chips */}
                <div className="flex flex-wrap gap-2">
                  {/* Time Difference */}
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    <Clock className="h-3 w-3" />
                    {match.timeDifferenceMinutes === 0
                      ? 'Exact time match'
                      : `${Math.abs(match.timeDifferenceMinutes)} min difference`}
                  </span>

                  {/* Vehicle Match */}
                  {match.vehicleMatch !== undefined && (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${match.vehicleMatch
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-600 border-rose-200'
                      }`}>
                      <Car className="h-3 w-3" />
                      Vehicle {match.vehicleMatch ? '✓' : '✗'}
                    </span>
                  )}

                  {/* Driver Match */}
                  {match.driverMatch !== undefined && (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${match.driverMatch
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-600 border-rose-200'
                      }`}>
                      <User className="h-3 w-3" />
                      Driver {match.driverMatch ? '✓' : '✗'}
                    </span>
                  )}

                  {/* Window Hit */}
                  {match.windowHit && (() => {
                    const w = getWindowLabel(match.windowHit);
                    if (!w) return null;
                    const WIcon = w.icon;
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${w.color}`}>
                        <WIcon className="h-3 w-3" />
                        {w.label}
                      </span>
                    );
                  })()}

                  {/* Data Quality */}
                  {match.dataQuality && (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${match.dataQuality === 'PRECISE'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : match.dataQuality === 'TIMED'
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : 'bg-amber-50 text-amber-600 border-amber-200'
                      }`}>
                      <Shield className="h-3 w-3" />
                      {match.dataQuality === 'PRECISE' ? 'High precision' : match.dataQuality === 'TIMED' ? 'Standard precision' : 'Date-only (low precision)'}
                    </span>
                  )}
                </div>

                {/* Variance */}
                {match.varianceAmount !== undefined && Math.abs(match.varianceAmount) > 0.005 && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${match.varianceAmount > 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                    }`}>
                    <DollarSign className="h-4 w-4" />
                    <span className="text-sm font-semibold">
                      {match.varianceAmount > 0 ? 'Overpaid by Uber: +' : 'Underpaid by Uber: -'}
                      ${Math.abs(match.varianceAmount).toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Ambiguity Warning */}
                {match.isAmbiguous && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold">Ambiguous Match</span>
                      <p className="text-xs text-orange-600 mt-0.5">
                        Multiple trips compete for this toll with similar confidence scores. Review the match carefully before confirming.
                      </p>
                    </div>
                  </div>
                )}

                {/* Reason */}
                {match.reason && (
                  <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" />
                    <span>{match.reason}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 3: Matched Trip Details */}
          {trip && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Navigation className="h-3.5 w-3.5" /> Matched Trip
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-emerald-50/40 rounded-lg p-4 border border-emerald-100">
                <DetailRow icon={Tag} label="Platform" value={normalizePlatform(trip.platform)} valueColor="text-emerald-700" />
                <DetailRow icon={Calendar} label="Trip Date" value={tripDate.date} />
                <DetailRow icon={Clock} label="Pickup Time" value={tripDate.time} />
                <DetailRow icon={Clock} label="Dropoff Time" value={tripDate.dropoff} />
                <DetailRow icon={DollarSign} label="Trip Amount" value={`$${trip.amount?.toFixed(2) || '0.00'}`} valueColor="text-slate-900 font-semibold" />
                <DetailRow icon={DollarSign} label="Toll Refund" value={`$${trip.tollCharges?.toFixed(2) || '0.00'}`} valueColor="text-emerald-600 font-semibold" />
                {trip.pickupLocation && (
                  <div className="col-span-2">
                    <DetailRow icon={MapPin} label="Pickup" value={trip.pickupLocation} />
                  </div>
                )}
                {trip.dropoffLocation && (
                  <div className="col-span-2">
                    <DetailRow icon={MapPin} label="Dropoff" value={trip.dropoffLocation} />
                  </div>
                )}
                <DetailRow icon={User} label="Driver" value={trip.driverName || 'Unknown'} />
                {trip.vehicleId && (
                  <DetailRow icon={Car} label="Vehicle" value={trip.vehicleId} />
                )}
                {trip.distance != null && (
                  <DetailRow icon={Route} label="Distance" value={`${trip.distance.toFixed(1)} km`} />
                )}
                {trip.duration != null && (
                  <DetailRow icon={Timer} label="Duration" value={`${trip.duration} min`} />
                )}
                {trip.serviceType && (
                  <DetailRow icon={Tag} label="Service" value={trip.serviceType} />
                )}
              </div>
            </div>
          )}

          {/* No match info */}
          {!match && (
            <div className="text-center py-6 bg-slate-50 rounded-lg border border-slate-200">
              <AlertTriangle className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">No matching trip found</p>
              <p className="text-xs text-slate-400 mt-1">Use the "Resolve" menu on the card to manually match or categorize this toll.</p>
            </div>
          )}

          <Separator />

          {/* Action Bar */}
          <div className="flex items-center gap-3">
            {renderActionButtons()}
            {onDismiss && match && (
              <Button variant="outline" onClick={onDismiss} className="text-slate-500">
                <X className="h-4 w-4 mr-2" /> Dismiss
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} className="ml-auto text-slate-400">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Subcomponent ---
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