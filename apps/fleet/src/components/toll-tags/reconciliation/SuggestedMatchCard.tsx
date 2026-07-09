import React from 'react';
import { Card, CardContent } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { ArrowRight, Check, X, Clock, DollarSign, MapPin, Camera, AlertTriangle, Car, User, Gauge } from "lucide-react";
import { FinancialTransaction, Trip } from "../../../types/data";
import { normalizePlatform } from '../../../utils/normalizePlatform';
import { format } from "date-fns";
import { MatchResult } from "../../../utils/tollReconciliation";
import { isTripLinkConfirmed } from "../../../utils/tollBucket";
import { MatchAlternatesPanel } from "./MatchAlternatesPanel";
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";

interface SuggestedMatchCardProps {
  transaction: FinancialTransaction;
  match: MatchResult;
  /** Full ranked match list when ambiguous — drives the alternates panel. */
  allMatches?: MatchResult[];
  onConfirm: () => void;
  onDismiss: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onFlag?: () => void;
  /** Deadhead-only: bill this toll to the driver instead of the fleet absorbing it. */
  onChargeDriver?: () => void;
  onClickDetail?: () => void;
  onSelectTrip?: (trip: Trip) => void;
  /** Prominent manual match when trip link is unsettled. */
  onFindMatch?: () => void;
}

export function SuggestedMatchCard({
  transaction, match, allMatches, onConfirm, onDismiss, onApprove, onReject, onFlag, onChargeDriver,
  onClickDetail, onSelectTrip, onFindMatch,
}: SuggestedMatchCardProps) {
  const { trip, confidence, reason, timeDifferenceMinutes, matchType, varianceAmount, confidenceScore, vehicleMatch, driverMatch, dataQuality, windowHit, isAmbiguous } = match;
  const isClaim = transaction.paymentMethod === 'Cash' || !!transaction.receiptUrl;
  const fleetTz = useFleetTimezone();

  const getScoreColor = (score: number) => {
    if (score >= 80) return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300', ring: 'ring-emerald-200' };
    if (score >= 50) return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', ring: 'ring-amber-200' };
    return { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-300', ring: 'ring-rose-200' };
  };

  const getMatchBadge = () => {
    switch (matchType) {
      case 'PERFECT_MATCH':
        return <Badge className="mb-2 bg-emerald-500 hover:bg-emerald-600">Reimbursed</Badge>;
      case 'DEADHEAD_MATCH':
        return <Badge className="mb-2 bg-blue-500 hover:bg-blue-600">Deadhead</Badge>;
      case 'AMOUNT_VARIANCE':
        return <Badge className="mb-2 bg-orange-500 hover:bg-orange-600">Underpaid</Badge>;
      case 'PERSONAL_MATCH':
        if (reason?.includes('Approach')) {
             return <Badge className="mb-2 bg-purple-600 hover:bg-purple-700">Unreimbursed Approach</Badge>;
        }
        return <Badge className="mb-2 bg-purple-500 hover:bg-purple-600">Personal</Badge>;
      default:
        return <Badge className="mb-2 bg-slate-500 hover:bg-slate-600">Possible Match</Badge>;
    }
  };

  const getBorderColor = () => {
    switch (matchType) {
        case 'PERFECT_MATCH': return 'border-l-emerald-500';
        case 'DEADHEAD_MATCH': return 'border-l-blue-500';
        case 'AMOUNT_VARIANCE': return 'border-l-orange-500';
        case 'PERSONAL_MATCH': return 'border-l-purple-500';
        default: return 'border-l-slate-300';
    }
  };

  const needsTripPick = !!(isAmbiguous && !isTripLinkConfirmed(transaction));
  const alternates = allMatches && allMatches.length > 0 ? allMatches : (needsTripPick ? [match] : []);

  const disabledAction = (button: React.ReactNode, tooltip: string) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex w-full lg:w-auto">{button}</span>
        </TooltipTrigger>
        <TooltipContent><p>{tooltip}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const renderActionButton = () => {
      if (needsTripPick) {
          return (
              <>
                  {disabledAction(
                      <Button size="sm" disabled className="bg-slate-300 w-full lg:w-auto cursor-not-allowed">
                          Choose trip below
                      </Button>,
                      'Pick the correct trip first',
                  )}
                  {onFindMatch && (
                      <Button size="sm" variant="outline" onClick={onFindMatch} className="w-full lg:w-auto">
                          Find Match...
                      </Button>
                  )}
              </>
          );
      }
      // Logic Branching for Driver Claims (Cash/Receipts)
      if (isClaim) {
          if (matchType === 'AMOUNT_VARIANCE') {
              return (
                  <Button size="sm" onClick={onFlag} className="bg-amber-600 hover:bg-amber-700 w-full lg:w-auto">
                      <Check className="h-4 w-4 mr-2" /> Flag for Claim
                  </Button>
              );
          }
          if (matchType === 'PERSONAL_MATCH') {
              return (
                  <Button size="sm" onClick={onReject} className="bg-rose-600 hover:bg-rose-700 w-full lg:w-auto">
                      <X className="h-4 w-4 mr-2" /> Reject Claim
                  </Button>
              );
          }
          if (matchType === 'DEADHEAD_MATCH' && onChargeDriver) {
              return (
                  <>
                      <Button size="sm" onClick={onApprove} className="bg-emerald-600 hover:bg-emerald-700 w-full lg:w-auto">
                          <Check className="h-4 w-4 mr-2" /> Approve Reimbursement
                      </Button>
                      <Button size="sm" onClick={onChargeDriver} variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50 w-full lg:w-auto">
                          <User className="h-4 w-4 mr-2" /> Charge Driver
                      </Button>
                  </>
              );
          }
          // Default / Perfect Match -> Approve
          return (
              <Button size="sm" onClick={onApprove} className="bg-emerald-600 hover:bg-emerald-700 w-full lg:w-auto">
                  <Check className="h-4 w-4 mr-2" /> Approve Reimbursement
              </Button>
          );
      }

      // Logic for Tag Imports (Fleet Expenses)
      // For tags, we generally "Link" them. Personal tags mean deducting from driver.
      // Variance tags might need review, but usually just linking to track the loss.
      // Phase 5: Contextual labels per matchType
      let label = 'Link Trip';
      if (matchType === 'PERSONAL_MATCH') label = 'Mark Personal';
      else if (matchType === 'DEADHEAD_MATCH') label = 'Confirm Deadhead';
      else if (matchType === 'AMOUNT_VARIANCE') label = 'Confirm & Flag';

      return (
          <>
              <Button size="sm" onClick={onConfirm} className="bg-emerald-600 hover:bg-emerald-700 w-full lg:w-auto">
                  <Check className="h-4 w-4 mr-2" /> {label}
              </Button>
              {matchType === 'DEADHEAD_MATCH' && onChargeDriver && (
                  <Button size="sm" onClick={onChargeDriver} variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50 w-full lg:w-auto">
                      <User className="h-4 w-4 mr-2" /> Charge Driver
                  </Button>
              )}
          </>
      );
  };

  return (
    <Card className={`border-l-4 bg-slate-50/50 w-full min-w-0 ${getBorderColor()} ${onClickDetail ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <CardContent className="p-4">
        <div className="flex flex-col xl:flex-row gap-4 items-stretch w-full min-w-0">
            
            {/* Left: Transaction (The Problem) */}
            <div className="flex-1 min-w-0 basis-0" onClick={onClickDetail}>
                <div className="flex items-center space-x-2 mb-2">
                    {transaction.receiptUrl ? (
                         <a href={transaction.receiptUrl} target="_blank" rel="noopener noreferrer" className="cursor-pointer hover:opacity-80 transition-opacity">
                             <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">
                                <Camera className="w-3 h-3 mr-1" /> View Receipt
                            </Badge>
                         </a>
                    ) : (
                        <Badge variant="outline" className="bg-white border-rose-200 text-rose-700">
                            Toll Charge
                        </Badge>
                    )}
                    <span className="text-sm text-slate-500">
                        {(() => {
                            try {
                                const timeStr = transaction.time || '12:00:00';
                                const cleanTime = timeStr.length >= 5 ? timeStr : '12:00:00';
                                const localDate = new Date(`${transaction.date}T${cleanTime}`);
                                if (!isNaN(localDate.getTime())) {
                                    return formatInFleetTz(localDate, fleetTz, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                                }
                                return formatInFleetTz(new Date(transaction.date), fleetTz, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                            } catch (e) {
                                return transaction.date;
                            }
                        })()}
                    </span>
                </div>
                <div className="font-bold text-lg text-rose-600">
                    -${Math.abs(transaction.amount).toFixed(2)}
                </div>
                <div className="text-sm text-slate-600 truncate">
                    {transaction.description || "Toll Usage"}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                    Vehicle: {transaction.vehiclePlate || "Unknown"}
                </div>
            </div>

            {/* Middle: Connection Info */}
            <div className="flex flex-col items-center justify-center px-4 py-3 bg-white rounded-lg border border-slate-100 shadow-sm w-full xl:w-auto xl:shrink-0 xl:max-w-[220px]" onClick={onClickDetail}>
                {getMatchBadge()}

                {/* Confidence Score Pill */}
                {confidenceScore != null && (
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold mb-1.5 border ${getScoreColor(confidenceScore).bg} ${getScoreColor(confidenceScore).text} ${getScoreColor(confidenceScore).border}`}>
                    <Gauge className="h-3 w-3" />
                    <span>{confidenceScore}</span>
                  </div>
                )}
                
                <div className="flex items-center text-xs text-slate-500 space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>
                        {timeDifferenceMinutes === 0 ? 'Exact time' : `${Math.abs(timeDifferenceMinutes)} min diff`}
                    </span>
                </div>

                {/* Identity Indicators */}
                {(vehicleMatch || driverMatch) && (
                  <div className="flex items-center gap-2 mt-1.5">
                    {vehicleMatch && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        <Car className="h-2.5 w-2.5" /> Vehicle ✓
                      </span>
                    )}
                    {driverMatch && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        <User className="h-2.5 w-2.5" /> Driver ✓
                      </span>
                    )}
                  </div>
                )}

                {reason && (
                    <div className="text-[10px] text-slate-400 mt-1 w-full text-center leading-snug break-words">
                        {reason}
                    </div>
                )}

                {/* Data Quality Warning */}
                {dataQuality === 'DATE_ONLY' && (
                  <div className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded mt-1 text-center">
                    Low timing precision
                  </div>
                )}
                
                {varianceAmount !== undefined && Math.abs(varianceAmount) > 0.005 && (
                     <div className={`flex items-center text-xs font-bold mt-1 ${varianceAmount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        <DollarSign className="h-3 w-3" />
                        <span>
                            {varianceAmount > 0 ? 'Profit: +' : 'Loss: -'}
                            ${Math.abs(varianceAmount).toFixed(2)}
                        </span>
                     </div>
                )}

                {/* Ambiguity Warning */}
                {isAmbiguous && (
                  <div className="flex items-center gap-1 text-[10px] text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded mt-1.5 w-full text-center leading-snug">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Ambiguous — multiple trips compete</span>
                  </div>
                )}

                <ArrowRight className="hidden xl:block h-4 w-4 text-slate-300 mt-2 rotate-90 xl:rotate-0" />
            </div>

            {/* Right: Trip (The Solution) */}
            <div className="flex-1 min-w-0 basis-0 text-left" onClick={onClickDetail}>
                <div className="flex items-center justify-start space-x-2 mb-2 flex-wrap">
                    <Badge variant="outline" className="bg-white border-emerald-200 text-emerald-700">
                        {normalizePlatform(trip.platform)} Trip
                    </Badge>
                    <span className="text-sm text-slate-500">
                        {formatInFleetTz(new Date(trip.date), fleetTz, { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                </div>
                <div className="font-bold text-lg text-emerald-600">
                    Refund: ${trip.tollCharges?.toFixed(2) || '0.00'}
                </div>
                <div className="text-sm text-slate-600 flex items-center justify-start">
                    <MapPin className="h-3 w-3 mr-1 text-slate-400 shrink-0" />
                    <span className="truncate">{trip.pickupLocation}</span>
                </div>
                 <div className="text-xs text-slate-400 mt-1">
                    Driver: {trip.driverName || "Unknown"}
                </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 w-full xl:w-auto xl:shrink-0 border-t xl:border-t-0 xl:border-l border-slate-200 pt-4 xl:pt-0 xl:pl-4">
                {renderActionButton()}
                
                <Button size="sm" variant="ghost" onClick={onDismiss} className="text-slate-500 w-full xl:w-auto">
                    <X className="h-4 w-4 mr-2" /> Dismiss
                </Button>
            </div>

        </div>

        {needsTripPick && onSelectTrip && alternates.length > 0 && (
          <MatchAlternatesPanel
            matches={alternates}
            onSelectTrip={onSelectTrip}
          />
        )}
      </CardContent>
    </Card>
  );
}