import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Loader2, ArrowUpRight, ArrowDownLeft, FileText, MinusCircle, Trash2, PlusCircle, Info } from "lucide-react";
import { format } from 'date-fns';
import { api } from '../../services/api';
import { FinancialTransaction, Trip, Claim } from '../../types/data';
import { calculateTollFinancials } from '../../utils/tollReconciliation';
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { toast } from "sonner@2.0.3";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

interface TollTopupHistoryProps {
  vehicleId: string;
  refreshTrigger?: number; // Prop to force refresh when a new top-up is added
  onTransactionChange?: () => void;
}

export function TollTopupHistory({ vehicleId, refreshTrigger, onTransactionChange }: TollTopupHistoryProps) {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [trips, setTrips] = useState<Record<string, Trip>>({});
  const [claims, setClaims] = useState<Record<string, Claim>>({});
  const [loading, setLoading] = useState(true);
  const [internalRefresh, setInternalRefresh] = useState(0);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      try {
        // Fetch all transactions, trips, and claims in parallel
        const [allTx, allTrips, allClaims] = await Promise.all([
            api.getTransactions(),
            api.getTrips(),
            api.getClaims()
        ]);

        // Filter for this vehicle AND category 'Toll Top-up' (or similar)
        // We might also want to include 'Toll Refund' if we want a full ledger here later
        const vehicleTollTx = allTx.filter(tx => 
            tx.vehicleId === vehicleId && 
            (tx.category === 'Toll Top-up' || tx.category === 'Tolls' || tx.category === 'Toll Usage')
        );
        
        // Sort by date descending
        vehicleTollTx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        setTransactions(vehicleTollTx);

        // Index trips by ID for faster lookup
        const tripsMap: Record<string, Trip> = {};
        allTrips.forEach(t => {
            tripsMap[t.id] = t;
        });
        setTrips(tripsMap);

        // Index claims by transaction ID for faster lookup
        const claimsMap: Record<string, Claim> = {};
        allClaims.forEach((c: Claim) => {
             if (c.transactionId) {
                 claimsMap[c.transactionId] = c;
             }
        });
        setClaims(claimsMap);

      } catch (error) {
        console.error("Failed to fetch toll history", error);
      } finally {
        setLoading(false);
      }
    }

    if (vehicleId) {
        fetchHistory();
    }
  }, [vehicleId, refreshTrigger, internalRefresh]);

  const handleDeleteClick = (id: string) => {
    setTransactionToDelete(id);
  };

  const confirmDelete = async () => {
    if (!transactionToDelete) return;
    
    try {
        await api.deleteTransaction(transactionToDelete);
        toast.success("Transaction deleted");
        setInternalRefresh(prev => prev + 1);
        onTransactionChange?.();
    } catch (error) {
        console.error("Failed to delete transaction", error);
        toast.error("Failed to delete transaction");
    } finally {
        setTransactionToDelete(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const renderTable = (data: FinancialTransaction[], showReconciliationCols: boolean = true) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Type</TableHead>
          {showReconciliationCols && (
            <>
              <TableHead>Platform</TableHead>
              <TableHead>Recovered</TableHead>
              <TableHead>Net Loss</TableHead>
            </>
          )}
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((tx) => {
          const linkedTrip = tx.tripId ? trips[tx.tripId] : undefined;
          const linkedClaim = claims[tx.id];
          const financials = calculateTollFinancials(tx, linkedTrip, linkedClaim);
          
          return (
          <TableRow key={tx.id}>
            <TableCell className="font-medium text-slate-700">
                {format(new Date(tx.date), 'MMM d, yyyy')}
                <div className="text-xs text-slate-400">{format(new Date(tx.date), 'h:mm a')}</div>
            </TableCell>
            <TableCell>
                <div className="flex flex-col">
                    <span>{tx.category}</span>
                    <span className="text-xs text-slate-500">{tx.description}</span>
                </div>
            </TableCell>
            <TableCell>
                {tx.category === 'Toll Usage' ? (
                    <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                         <MinusCircle className="h-3 w-3 mr-1" /> Usage (Toll)
                    </Badge>
                ) : (tx.category === 'Toll Top-up' || tx.description?.toLowerCase().includes('top-up')) ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                         <ArrowDownLeft className="h-3 w-3 mr-1" /> Top-up (Credit)
                    </Badge>
                ) : tx.amount < 0 ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                         <ArrowUpRight className="h-3 w-3 mr-1" /> Expense
                    </Badge>
                ) : (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        <ArrowDownLeft className="h-3 w-3 mr-1" /> Refund (Income)
                    </Badge>
                )}
            </TableCell>
            {showReconciliationCols && (
            <>
            <TableCell>
                {linkedTrip ? (
                    <Badge variant="outline" className="capitalize">
                        {linkedTrip.platform}
                    </Badge>
                ) : tx.category === 'Toll Usage' ? (
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-normal hover:bg-slate-200">
                        Unmatched / Personal
                    </Badge>
                ) : (
                    <span className="text-slate-300">-</span>
                )}
            </TableCell>
            <TableCell>
                {financials.totalRecovered > 0 ? (
                    <Tooltip>
                        <TooltipTrigger>
                            <div className="flex items-center gap-1 text-emerald-600 font-medium cursor-help">
                                +${financials.totalRecovered.toFixed(2)}
                                <Info className="h-3 w-3 opacity-50" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <div className="space-y-1 text-xs">
                                <div className="font-semibold">Recovery Breakdown</div>
                                <div className="flex justify-between gap-4">
                                    <span>Platform Refund:</span>
                                    <span>${financials.platformRefund.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span>Driver Charge:</span>
                                    <span>${financials.driverRecovered.toFixed(2)}</span>
                                </div>
                                {financials.fleetAbsorbed > 0 && (
                                    <div className="flex justify-between gap-4 text-amber-600">
                                        <span>Fleet Absorbed:</span>
                                        <span>${financials.fleetAbsorbed.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                        </TooltipContent>
                    </Tooltip>
                ) : (
                    <span className="text-slate-300">-</span>
                )}
            </TableCell>
            <TableCell>
                {tx.category === 'Toll Usage' ? (
                    financials.netLoss > 0 ? (
                        financials.fleetAbsorbed > 0 ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                -${financials.netLoss.toFixed(2)}
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                                -${financials.netLoss.toFixed(2)}
                            </Badge>
                        )
                    ) : (
                        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">
                            $0.00
                        </Badge>
                    )
                ) : (
                    <span className="text-slate-300">-</span>
                )}
            </TableCell>
            </>
            )}
            <TableCell className={`text-right font-bold ${tx.category === 'Toll Usage' ? 'text-slate-600' : (tx.amount < 0 ? 'text-rose-600' : 'text-emerald-600')}`}>
              {tx.amount < 0 ? '-' : '+'}${Math.abs(tx.amount).toFixed(2)}
            </TableCell>
            <TableCell>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-red-600"
                    onClick={() => handleDeleteClick(tx.id)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </TableCell>
          </TableRow>
        )})}
      </TableBody>
    </Table>
  );

  const topUps = transactions.filter(t => t.amount > 0 || t.category === 'Toll Top-up' || t.description?.toLowerCase().includes('top-up'));
  const usage = transactions.filter(t => t.amount < 0 && t.category !== 'Toll Top-up');

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
            <CardTitle>Toll Transaction History</CardTitle>
            <CardDescription>Recent top-ups and charges</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
           <div className="text-center py-8 text-slate-500 text-sm">
               No toll transactions recorded yet.
           </div>
        ) : (
        <Tabs defaultValue="all" className="w-full">
            <TabsList className="mb-4">
                <TabsTrigger value="all">
                    All Transactions
                    <span className="ml-2 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                        {transactions.length}
                    </span>
                </TabsTrigger>
                <TabsTrigger value="usage">
                    Usage Only
                    <span className="ml-2 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                        {usage.length}
                    </span>
                </TabsTrigger>
                <TabsTrigger value="topups">
                    Top-ups
                    <span className="ml-2 bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                        {topUps.length}
                    </span>
                </TabsTrigger>
            </TabsList>
            
            <TabsContent value="all">
                {renderTable(transactions, true)}
            </TabsContent>
            
            <TabsContent value="usage">
                {renderTable(usage, true)}
            </TabsContent>
            
            <TabsContent value="topups">
                {renderTable(topUps, false)}
            </TabsContent>
        </Tabs>
        )}
      </CardContent>
    </Card>

    <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete this transaction from the history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
