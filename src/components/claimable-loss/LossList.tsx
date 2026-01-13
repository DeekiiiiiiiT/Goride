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
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { Checkbox } from "../ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { AlertCircle, ArrowRight, Clock, MoreHorizontal, Undo2 } from "lucide-react";
import { FinancialTransaction, Trip } from "../../types/data";
import { MatchResult, calculateTollFinancials } from "../../utils/tollReconciliation";
import { calculateDaysRemaining } from "../../utils/timeUtils";

interface LossItem {
  transaction: FinancialTransaction;
  match: MatchResult;
}

interface LossListProps {
  losses: LossItem[];
  isLoading?: boolean;
  onSelectLoss: (item: LossItem) => void;
  onReverse?: (item: LossItem) => void;
  onBulkReverse?: (items: LossItem[]) => void;
}

export function LossList({ losses, isLoading, onSelectLoss, onReverse, onBulkReverse }: LossListProps) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // Reset selection when losses change (e.g. after a refresh)
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [losses]);

  const toggleSelectAll = () => {
    if (selectedIds.size === losses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(losses.map(l => l.transaction.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkAction = () => {
    if (!onBulkReverse) return;
    const selectedItems = losses.filter(l => selectedIds.has(l.transaction.id));
    onBulkReverse(selectedItems);
    setSelectedIds(new Set());
  };

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
            <h3 className="font-semibold text-slate-900">Underpaid Trips {losses.length > 0 && <span className="ml-2 bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs">{losses.length}</span>}</h3>
            <p className="text-sm text-slate-500">Tolls incurred during a trip that were not fully refunded.</p>
        </div>
        <div className="flex items-center gap-4">
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="text-sm text-slate-500 font-medium">{selectedIds.size} selected</span>
                    <Button 
                        size="sm" 
                        variant="outline"
                        onClick={handleBulkAction}
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200"
                    >
                        <Undo2 className="mr-2 h-4 w-4" />
                        Reverse
                    </Button>
                </div>
            )}
            <div className="text-sm font-medium text-slate-600">
                Total Potential Claim: <span className="text-orange-600 font-bold ml-1">
                    ${losses.reduce((sum, item) => sum + Math.abs(item.match.varianceAmount || 0), 0).toFixed(2)}
                </span>
            </div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
                <Checkbox 
                    checked={losses.length > 0 && selectedIds.size === losses.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                />
            </TableHead>
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
            const financials = calculateTollFinancials(transaction, match.trip);
            const tollCost = financials.cost;
            const uberRefund = financials.platformRefund;
            const loss = financials.netLoss;
            const { daysRemaining, status } = calculateDaysRemaining(transaction.date);

            const getExpiryDisplay = (days: number, status: string) => {
                if (status === 'expired') {
                    return {
                        color: "text-red-600 font-bold",
                        icon: <AlertCircle className="h-3 w-3" />,
                        text: "Expired"
                    };
                }
                
                // Cold to Hot Scale (10 days -> 0 days)
                // Green is the coldest (safest/furthest from expiry)
                if (days <= 2) return { color: "text-rose-600 font-bold animate-pulse", icon: <Clock className="h-3 w-3" />, text: `${days} days left` }; // Hot
                if (days <= 4) return { color: "text-orange-600 font-bold", icon: <Clock className="h-3 w-3" />, text: `${days} days left` }; // Warm
                if (days <= 6) return { color: "text-amber-600 font-medium", icon: <Clock className="h-3 w-3" />, text: `${days} days left` }; // Lukewarm
                if (days <= 8) return { color: "text-blue-600 font-medium", icon: <Clock className="h-3 w-3" />, text: `${days} days left` }; // Cool
                return { color: "text-emerald-600 font-medium", icon: <Clock className="h-3 w-3" />, text: `${days} days left` }; // Coldest
            };

            const expiry = getExpiryDisplay(daysRemaining, status);

            return (
              <TableRow key={transaction.id} data-state={selectedIds.has(transaction.id) ? "selected" : undefined}>
                <TableCell>
                    <Checkbox 
                        checked={selectedIds.has(transaction.id)}
                        onCheckedChange={() => toggleSelect(transaction.id)}
                        aria-label="Select row"
                    />
                </TableCell>
                <TableCell className="font-medium text-slate-700">
                  {new Date(transaction.date).toLocaleDateString()}
                  <div className="text-xs text-slate-400">{transaction.time}</div>
                  
                  <div className={`mt-1 text-xs flex items-center gap-1 ${expiry.color}`}>
                      {expiry.icon}
                      {expiry.text}
                  </div>
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-2">
                        Actions <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onSelectLoss({ transaction, match })}>
                        <ArrowRight className="mr-2 h-4 w-4" />
                        View Match
                      </DropdownMenuItem>
                      {onReverse && (
                        <>
                          <DropdownMenuSeparator />
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onReverse({ transaction, match });
                                  }}
                                  className="text-orange-600 focus:text-orange-700 focus:bg-orange-50"
                                >
                                  <Undo2 className="mr-2 h-4 w-4" />
                                  Reverse
                                </DropdownMenuItem>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p>Send claim back to Toll Reconciliation list</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
