import React from 'react';
import { Card, CardContent } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { ArrowRight, Check, X, Clock, DollarSign, MapPin, Camera, AlertTriangle, Car, User, Gauge } from "lucide-react";
import { FinancialTransaction, Trip } from "../../../types/data";
import { normalizePlatform } from '../../../utils/normalizePlatform';
import { format } from "date-fns";
import { MatchResult } from "../../../utils/tollReconciliation";

interface SuggestedMatchCardProps {
  transaction: FinancialTransaction;
  match: MatchResult;
  onConfirm: () => void;
  onDismiss: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onFlag?: () => void;
  onClickDetail?: () => void;
}

export function SuggestedMatchCard({ transaction, match, onConfirm, onDismiss, onApprove, onReject, onFlag, onClickDetail }: SuggestedMatchCardProps) {
  const { trip, confidence, reason, timeDifferenceMinutes, matchType, varianceAmount, confidenceScore, vehicleMatch, driverMatch, dataQuality, windowHit, isAmbiguous } = match;
  const isClaim = transaction.paymentMethod === 'Cash' || !!transaction.receiptUrl;

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

  const renderActionButton = () => {
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
      const label = matchType === 'PERSONAL_MATCH' ? 'Mark Personal' : 'Link Trip';
      
      return (
          <Button size="sm" onClick={onConfirm} className="bg-emerald-600 hover:bg-emerald-700 w-full lg:w-auto">
              <Check className="h-4 w-4 mr-2" /> {label}
          </Button>
      );
  };

  return (
    <Card className={`border-l-4 bg-slate-50/50 ${getBorderColor()} ${onClickDetail ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            
            {/* Left: Transaction (The Problem) */}
            <div className="flex-1 min-w-0" onClick={onClickDetail}>
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
                                // Force local date by appending time
                                const localDate = new Date(`${transaction.date}T${cleanTime}`);
                                if (!isNaN(localDate.getTime())) {
                                    return format(localDate, 'MMM d, h:mm a');
                                }
                                return format(new Date(transaction.date), 'MMM d, h:mm a');
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
            <div className="flex flex-col items-center justify-center px-4 py-2 bg-white rounded-lg border border-slate-100 shadow-sm min-w-[160px]" onClick={onClickDetail}>
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
                    <div className="text-[10px] text-slate-400 mt-1 max-w-[140px] text-center leading-tight">
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
                  <div className="flex items-center gap-1 text-[10px] text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded mt-1.5 max-w-[160px] text-center leading-tight">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>Ambiguous — multiple trips compete</span>
                  </div>
                )}

                <ArrowRight className="h-4 w-4 text-slate-300 mt-2" />
            </div>

            {/* Right: Trip (The Solution) */}
            <div className="flex-1 min-w-0 text-right lg:text-left" onClick={onClickDetail}>
                <div className="flex items-center justify-end lg:justify-start space-x-2 mb-2">
                    <Badge variant="outline" className="bg-white border-emerald-200 text-emerald-700">
                        {normalizePlatform(trip.platform)} Trip
                    </Badge>
                    <span className="text-sm text-slate-500">
                        {format(new Date(trip.date), 'h:mm a')}
                    </span>
                </div>
                <div className="font-bold text-lg text-emerald-600">
                    Refund: ${trip.tollCharges?.toFixed(2) || '0.00'}
                </div>
                <div className="text-sm text-slate-600 flex items-center justify-end lg:justify-start">
                    <MapPin className="h-3 w-3 mr-1 text-slate-400" />
                    <span className="truncate max-w-[200px]">{trip.pickupLocation}</span>
                </div>
                 <div className="text-xs text-slate-400 mt-1">
                    Driver: {trip.driverName || "Unknown"}
                </div>
            </div>

            {/* Actions */}
            <div className="flex lg:flex-col gap-2 border-t lg:border-t-0 lg:border-l border-slate-200 pt-4 lg:pt-0 lg:pl-4 mt-4 lg:mt-0 w-full lg:w-auto justify-end">
                {renderActionButton()}
                
                <Button size="sm" variant="ghost" onClick={onDismiss} className="text-slate-500 w-full lg:w-auto">
                    <X className="h-4 w-4 mr-2" /> Dismiss
                </Button>
            </div>

        </div>
      </CardContent>
    </Card>
  );
}