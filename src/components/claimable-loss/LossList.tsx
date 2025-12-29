import React from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { AlertCircle, ArrowRight } from "lucide-react";
import { FinancialTransaction, Trip } from "../../types/data";
import { MatchResult } from "../../utils/tollReconciliation";

interface LossItem {
  transaction: FinancialTransaction;
  match: MatchResult;
}

interface LossListProps {
  losses: LossItem[];
  isLoading?: boolean;
  onSelectLoss: (item: LossItem) => void;
}

export function LossList({ losses, isLoading, onSelectLoss }: LossListProps) {
  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Analyzing claims...</div>;
  }

  if (losses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-slate-50">
        <div className="bg-orange-100 p-3 rounded-full mb-4">
          <AlertCircle className="h-6 w-6 text-orange-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No claimable losses found</h3>
        <p className="text-slate-500 text-sm mt-1">Great job! All active trips appear to be fully reimbursed.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-white shadow-sm">
      <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
        <div>
            <h3 className="font-semibold text-slate-900">Underpaid Trips</h3>
            <p className="text-sm text-slate-500">Tolls incurred during a trip that were not fully refunded.</p>
        </div>
        <div className="text-sm font-medium text-slate-600">
            Total Potential Claim: <span className="text-orange-600 font-bold ml-1">
                ${losses.reduce((sum, item) => sum + Math.abs(item.match.varianceAmount || 0), 0).toFixed(2)}
            </span>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Toll Description</TableHead>
            <TableHead>Trip Ref</TableHead>
            <TableHead className="text-right">Toll Cost</TableHead>
            <TableHead className="text-right">Uber Refund</TableHead>
            <TableHead className="text-right">Net Loss</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {losses.map(({ transaction, match }) => {
            const tollCost = Math.abs(transaction.amount);
            const uberRefund = match.trip.tollCharges || 0;
            const loss = Math.abs(match.varianceAmount || (tollCost - uberRefund));

            return (
              <TableRow key={transaction.id}>
                <TableCell className="font-medium text-slate-700">
                  {new Date(transaction.date).toLocaleDateString()}
                  <div className="text-xs text-slate-400">{transaction.time}</div>
                </TableCell>
                <TableCell>
                    <div className="font-medium">{transaction.description}</div>
                    <div className="text-xs text-slate-500 capitalize">{transaction.category}</div>
                </TableCell>
                <TableCell>
                    <div className="flex flex-col text-xs">
                        <span className="font-mono text-slate-600">
                            {match.trip.pickupLocation?.split(',')[0] || 'Unknown Origin'} 
                            <span className="mx-1">→</span> 
                            {match.trip.dropoffLocation?.split(',')[0] || 'Unknown Dest'}
                        </span>
                        <span className="text-slate-400 mt-0.5">
                            {new Date(match.trip.requestTime || match.trip.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                    </div>
                </TableCell>
                <TableCell className="text-right text-slate-600">
                  ${tollCost.toFixed(2)}
                </TableCell>
                <TableCell className="text-right text-emerald-600">
                  ${uberRefund.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 font-bold">
                    -${loss.toFixed(2)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8"
                    onClick={() => onSelectLoss({ transaction, match })}
                  >
                    View Match <ArrowRight className="ml-2 h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
