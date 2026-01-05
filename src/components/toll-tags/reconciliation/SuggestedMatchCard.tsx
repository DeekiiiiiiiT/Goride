import React from 'react';
import { Card, CardContent } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { ArrowRight, Check, X, Clock, DollarSign, MapPin, Camera } from "lucide-react";
import { FinancialTransaction, Trip } from "../../../types/data";
import { format } from "date-fns";
import { MatchResult } from "../../../utils/tollReconciliation";

interface SuggestedMatchCardProps {
  transaction: FinancialTransaction;
  match: MatchResult;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function SuggestedMatchCard({ transaction, match, onConfirm, onDismiss }: SuggestedMatchCardProps) {
  const { trip, confidence, reason, timeDifferenceMinutes, matchType, varianceAmount } = match;

  const getMatchBadge = () => {
    switch (matchType) {
      case 'PERFECT_MATCH':
        return <Badge className="mb-2 bg-emerald-500 hover:bg-emerald-600">Reimbursed</Badge>;
      case 'DEADHEAD_MATCH':
        return <Badge className="mb-2 bg-blue-500 hover:bg-blue-600">Deadhead</Badge>;
      case 'AMOUNT_VARIANCE':
        return <Badge className="mb-2 bg-orange-500 hover:bg-orange-600">Underpaid</Badge>;
      case 'PERSONAL_MATCH':
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

  return (
    <Card className={`border-l-4 bg-slate-50/50 ${getBorderColor()}`}>
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            
            {/* Left: Transaction (The Problem) */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-2">
                    {transaction.receiptUrl ? (
                         <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">
                            <Camera className="w-3 h-3 mr-1" /> Manual Scan
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="bg-white border-rose-200 text-rose-700">
                            Toll Charge
                        </Badge>
                    )}
                    <span className="text-sm text-slate-500">
                        {format(new Date(transaction.date), 'MMM d, h:mm a')}
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
            <div className="flex flex-col items-center justify-center px-4 py-2 bg-white rounded-lg border border-slate-100 shadow-sm min-w-[160px]">
                {getMatchBadge()}
                
                <div className="flex items-center text-xs text-slate-500 space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>
                        {timeDifferenceMinutes === 0 ? 'Exact time' : `${Math.abs(timeDifferenceMinutes)} min diff`}
                    </span>
                </div>
                
                {varianceAmount !== undefined && Math.abs(varianceAmount) > 0.005 && (
                     <div className={`flex items-center text-xs font-bold mt-1 ${varianceAmount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        <DollarSign className="h-3 w-3" />
                        <span>
                            {varianceAmount > 0 ? 'Profit: +' : 'Loss: -'}
                            ${Math.abs(varianceAmount).toFixed(2)}
                        </span>
                     </div>
                )}

                <ArrowRight className="h-4 w-4 text-slate-300 mt-2" />
            </div>

            {/* Right: Trip (The Solution) */}
            <div className="flex-1 min-w-0 text-right lg:text-left">
                <div className="flex items-center justify-end lg:justify-start space-x-2 mb-2">
                    <Badge variant="outline" className="bg-white border-emerald-200 text-emerald-700">
                        {trip.platform} Trip
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
                <Button size="sm" onClick={onConfirm} className="bg-emerald-600 hover:bg-emerald-700 w-full lg:w-auto">
                    <Check className="h-4 w-4 mr-2" /> Match
                </Button>
                <Button size="sm" variant="ghost" onClick={onDismiss} className="text-slate-500 w-full lg:w-auto">
                    <X className="h-4 w-4 mr-2" /> Dismiss
                </Button>
            </div>

        </div>
      </CardContent>
    </Card>
  );
}
