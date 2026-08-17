import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Loader2, ArrowUpRight, ArrowDownLeft, FileText, MinusCircle, Ban, Info, Tag as TagIcon } from "lucide-react";
import { format } from 'date-fns';
import { api } from '../../services/api';
import { FinancialTransaction, Claim } from '../../types/data';
import { calculateTollFinancials, buildTollFinancialsContext, sumTagUsageFinancials } from '../../utils/tollReconciliation';
import { isTagLedgerTx, isTagUsage, isTagCredit, isVoidedTx } from '../../utils/tollTagLedger';
import { DisputeRefund } from '../../types/data';
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { toast } from "sonner@2.0.3";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { TollTransactionDetailOverlay } from "./TollTransactionDetailOverlay";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
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
  tagNumber?: string; // Phase 4: Filter transactions to this specific tag
  tagId?: string; // Phase 6: tag UUID for per-tag (cross-vehicle) scoping
  refreshTrigger?: number; // Prop to force refresh when a new top-up is added
  onTransactionChange?: () => void;
  /**
   * 'tag' restricts the view to prepaid tag-ledger activity (tag-balance usage +
   * top-ups/refunds), hiding cash/off-tag tolls, and requests per-tag scoping
   * from the server. Default 'all' preserves the legacy behavior.
   */
  scope?: 'all' | 'tag';
  thisTagOnly?: boolean;
  dateFilteredTransactions?: FinancialTransaction[];
  claimsList?: Claim[];
  disputeRefunds?: DisputeRefund[];
}

function txNeedsForceVoid(tx: FinancialTransaction): boolean {
  if (tx.isReconciled) return true;
  const status = String(tx.status || '').toLowerCase();
  if (status === 'reconciled' || status === 'approved' || status === 'resolved') return true;
  if ((tx as any).matchStatus === 'matched' || (tx as any).workflowStage === 'matched') return true;
  return false;
}

const PAGE_SIZE = 25;

function ColHint({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-help">{label}<Info className="h-3 w-3 opacity-40" /></span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function TollTopupHistory({
  vehicleId,
  tagNumber,
  tagId,
  refreshTrigger,
  onTransactionChange,
  scope = 'all',
  thisTagOnly = false,
  dateFilteredTransactions,
  claimsList,
  disputeRefunds = [],
}: TollTopupHistoryProps) {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [claims, setClaims] = useState<Record<string, Claim>>({});
  const [loading, setLoading] = useState(true);
  const [internalRefresh, setInternalRefresh] = useState(0);
  const [transactionToVoid, setTransactionToVoid] = useState<FinancialTransaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [forceVoidConfirmed, setForceVoidConfirmed] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransaction | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [localDisputes, setLocalDisputes] = useState<DisputeRefund[]>(disputeRefunds);

  useEffect(() => {
    setLocalDisputes(disputeRefunds);
  }, [disputeRefunds]);

  useEffect(() => {
    if (dateFilteredTransactions) {
      setTransactions(dateFilteredTransactions);
      if (claimsList) {
        const claimsMap: Record<string, Claim> = {};
        claimsList.forEach((c) => {
          if (c.transactionId) claimsMap[c.transactionId] = c;
        });
        setClaims(claimsMap);
      }
      setLoading(false);
      return;
    }

    async function fetchHistory() {
      setLoading(true);
      try {
        const [tollResponse, allClaims, disputesRes] = await Promise.all([
            api.getTollLogs(scope === 'tag'
              ? { vehicleId, tagNumber, tagId, scope: 'tag', limit: 200, offset: 0 }
              : { vehicleId, tagNumber, limit: 200, offset: 0 }),
            api.getClaims(),
            api.getDisputeRefunds().catch(() => ({ data: [] as DisputeRefund[] })),
        ]);

        setTransactions(tollResponse?.data || []);
        setLocalDisputes(disputesRes?.data || []);
        const claimsMap: Record<string, Claim> = {};
        allClaims.forEach((c: Claim) => {
             if (c.transactionId) claimsMap[c.transactionId] = c;
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
  }, [vehicleId, tagNumber, tagId, scope, refreshTrigger, internalRefresh, dateFilteredTransactions, claimsList]);

  const handleVoidClick = (tx: FinancialTransaction) => {
    setTransactionToVoid(tx);
    setVoidReason('');
    setForceVoidConfirmed(false);
  };

  const confirmVoid = async () => {
    if (!transactionToVoid) return;
    const reason = voidReason.trim();
    if (!reason) {
      toast.error("Enter a reason to void this entry");
      return;
    }
    const needsForce = txNeedsForceVoid(transactionToVoid);
    if (needsForce && !forceVoidConfirmed) {
      toast.error("Confirm force void for this reconciled entry");
      return;
    }

    setVoiding(true);
    try {
      await api.voidTollLedgerEntry(transactionToVoid.id, reason, needsForce ? true : undefined);
      toast.success("Transaction voided");
      setTransactionToVoid(null);
      setInternalRefresh(prev => prev + 1);
      onTransactionChange?.();
    } catch (error: any) {
      console.error("Failed to void transaction", error);
      if (error?.status === 409 || error?.code === 'REQUIRES_FORCE') {
        toast.error("This entry is reconciled — confirm force void and try again");
        setForceVoidConfirmed(false);
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to void transaction");
      }
    } finally {
      setVoiding(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const normalizeTag = (t: string) => t.trim().replace(/^0+/, '');
  const isDifferentTag = (tx: FinancialTransaction) => {
    const txTagId = tx.metadata?.tollTagId || tx.metadata?.tagId || tx.metadata?.tagNumber;
    return !!(tagNumber && txTagId && normalizeTag(String(txTagId)) !== normalizeTag(tagNumber));
  };

  // In 'tag' scope, hide cash/off-tag tolls so the tag view shows only prepaid
  // tag-ledger activity (tag-balance usage + top-ups/refunds).
  const visible = (scope === 'tag' ? transactions.filter(isTagLedgerTx) : transactions)
    .filter((tx) => !thisTagOnly || !isDifferentTag(tx));

  const tripsFromRows = visible
    .map((tx) => (tx as any).linkedTrip)
    .filter(Boolean);
  const { allocation } = sumTagUsageFinancials({
    usageTolls: visible.filter(isTagUsage),
    claims: Object.values(claims),
    disputeRefunds: localDisputes,
    trips: tripsFromRows,
  });

  const renderTable = (data: FinancialTransaction[], showReconciliationCols: boolean = true) => (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>
            <ColHint label="Type" hint="Usage is a tag deduction at a plaza. Top-up is money added to the tag." />
          </TableHead>
          {showReconciliationCols && (
            <>
              <TableHead>
                <ColHint label="Platform" hint="Uber/InDrive trip this charge is linked to. Unmatched means no trip yet — often personal or deadhead." />
              </TableHead>
              <TableHead>
                <ColHint label="Recovered" hint="Trip refund share + dispute credits + driver charge. Sibling plazas on the same trip share one refund." />
              </TableHead>
              <TableHead>
                <ColHint label="Net Loss" hint="Tag cost minus recovered. Driver paid means the driver was charged the remainder." />
              </TableHead>
            </>
          )}
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.slice(0, visibleCount).map((tx) => {
          const linkedTrip = (tx as any).linkedTrip || undefined;
          const linkedClaim = claims[tx.id];
          const voided = isVoidedTx(tx);
          const ctx = voided
            ? undefined
            : buildTollFinancialsContext(tx, linkedTrip, linkedClaim, tripsFromRows, localDisputes, allocation);
          const financials = voided
            ? { totalRecovered: 0, platformRefund: 0, driverRecovered: 0, fleetAbsorbed: 0, netLoss: 0 }
            : calculateTollFinancials(tx, linkedTrip, linkedClaim, ctx);
          
          // Phase 4: Check if this transaction belongs to a different tag
          const txTagId = tx.metadata?.tollTagId || tx.metadata?.tagId;
          const isDifferentTagRow = isDifferentTag(tx);
          const displayAmount = voided
            ? Number(tx.metadata?.originalAmount ?? tx.amount ?? 0)
            : tx.amount;

          return (
          <TableRow key={tx.id} className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${voided ? 'opacity-60' : ''}`} onClick={() => setSelectedTransaction(tx)}>
            <TableCell className="font-medium text-slate-700">
                {format(new Date(tx.date), 'MMM d, yyyy')}
                <div className="text-xs text-slate-400">{format(new Date(tx.date), 'h:mm a')}</div>
            </TableCell>
            <TableCell>
                <div className="flex flex-col gap-0.5">
                    <span>{tx.category}</span>
                    <span className="text-xs text-slate-500">{tx.description}</span>
                    {voided && (
                        <Badge variant="outline" className="w-fit bg-slate-100 text-slate-600 border-slate-300 text-[10px] px-1.5 py-0">
                            Voided
                        </Badge>
                    )}
                    {isDifferentTagRow && (
                        <Tooltip>
                            <TooltipTrigger>
                                <Badge variant="outline" className="w-fit bg-slate-50 text-slate-500 border-slate-200 text-[10px] px-1.5 py-0">
                                    <TagIcon className="h-2.5 w-2.5 mr-0.5" /> Different Tag
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>This transaction is from tag {txTagId}, not the current tag ({tagNumber})</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </TableCell>
            <TableCell>
                {tx.category === 'Toll Usage' ? (
                    <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                         <MinusCircle className="h-3 w-3 mr-1" /> Toll usage
                    </Badge>
                ) : (tx.category === 'Toll Top-up' || tx.description?.toLowerCase().includes('top-up')) ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                         <ArrowDownLeft className="h-3 w-3 mr-1" /> Top-up (Credit)
                    </Badge>
                ) : (tx.receiptUrl || tx.paymentMethod === 'Cash' || tx.description?.toLowerCase().includes('receipt')) ? (
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                         <FileText className="h-3 w-3 mr-1" /> Cash Receipt
                    </Badge>
                ) : displayAmount < 0 ? (
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
                {voided ? (
                    <span className="text-slate-300">-</span>
                ) : linkedTrip ? (
                    <Badge variant="outline" className="capitalize">
                        {linkedTrip.platform}
                    </Badge>
                ) : tx.category === 'Toll Usage' ? (
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-normal hover:bg-slate-200">
                        Unmatched
                    </Badge>
                ) : (
                    <span className="text-slate-300">-</span>
                )}
            </TableCell>
            <TableCell>
                {!voided && financials.totalRecovered > 0 ? (
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
                {voided ? (
                    <span className="text-slate-300">-</span>
                ) : (tx.category === 'Toll Usage' || tx.category === 'Toll' || tx.category === 'Tolls') ? (
                    financials.netLoss > 0 ? (
                        financials.fleetAbsorbed > 0 ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                -${financials.netLoss.toFixed(2)}
                            </Badge>
                        ) : (
                            // Unmatched OR Underpaid (Uber didn't cover it) -> Red
                            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                                -${financials.netLoss.toFixed(2)}
                            </Badge>
                        )
                    ) : financials.driverRecovered > 0 ? (
                         // Fully Recovered via Driver Charge -> Orange
                         <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                            Driver paid
                         </Badge>
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
            <TableCell className={`text-right font-bold ${voided ? 'text-slate-400 line-through' : (tx.category === 'Toll Usage' ? 'text-slate-600' : (displayAmount < 0 ? 'text-rose-600' : 'text-emerald-600'))}`}>
              {displayAmount < 0 ? '-' : '+'}${Math.abs(displayAmount).toFixed(2)}
            </TableCell>
            <TableCell>
                {!voided && (
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-red-600"
                    onClick={(e) => { e.stopPropagation(); handleVoidClick(tx); }}
                    title="Void entry"
                >
                    <Ban className="h-4 w-4" />
                </Button>
                )}
            </TableCell>
          </TableRow>
        )})}
      </TableBody>
    </Table>
    {data.length > visibleCount && (
      <div className="flex justify-center pt-3">
        <Button variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
          Load more
        </Button>
      </div>
    )}
    </>
  );

  const topUps = scope === 'tag'
    ? visible.filter(isTagCredit)
    : visible.filter(t => !isVoidedTx(t) && (t.amount > 0 || t.category === 'Toll Top-up' || t.description?.toLowerCase().includes('top-up') || t.description?.toLowerCase().includes('top up')));
  const usage = scope === 'tag'
    ? visible.filter(isTagUsage)
    : visible.filter(t => !isVoidedTx(t) && t.amount < 0 && t.category !== 'Toll Top-up');

  const needsForce = transactionToVoid ? txNeedsForceVoid(transactionToVoid) : false;
  const nested = !!dateFilteredTransactions;

  const body = (
        <>
        {visible.some(isDifferentTag) && !thisTagOnly && (
          <p className="text-xs text-slate-500 mb-3">
            Rows marked Different Tag belong to another tag on this vehicle (not yet backfilled). Toggle “This tag only” on Overview to hide them.
          </p>
        )}
        {visible.length === 0 ? (
           <div className="text-center py-8 text-slate-500 text-sm">
               No toll transactions recorded yet.
           </div>
        ) : (
        <Tabs defaultValue="all" className="w-full">
            <TabsList className="mb-4">
                <TabsTrigger value="all">
                    All Transactions
                    <span className="ml-2 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs font-bold">
                        {visible.length}
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
                {renderTable(visible, true)}
            </TabsContent>
            
            <TabsContent value="usage">
                {renderTable(usage, true)}
            </TabsContent>
            
            <TabsContent value="topups">
                {renderTable(topUps, false)}
            </TabsContent>
        </Tabs>
        )}
        </>
  );

  return (
    <>
    {nested ? body : (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
            <CardTitle>Toll Transaction History</CardTitle>
            <CardDescription>Recent top-ups and charges</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {body}
      </CardContent>
    </Card>
    )}

    <AlertDialog open={!!transactionToVoid} onOpenChange={(open) => !open && !voiding && setTransactionToVoid(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void toll entry?</AlertDialogTitle>
          <AlertDialogDescription>
            This zeros the amount for balance purposes but keeps an audit trail. It does not hard-delete the record.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Why is this entry being voided?"
              rows={3}
              disabled={voiding}
            />
          </div>
          {needsForce && (
            <label className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={forceVoidConfirmed}
                onChange={(e) => setForceVoidConfirmed(e.target.checked)}
                disabled={voiding}
              />
              <span>
                This entry is already reconciled or matched. I understand force void will remove it from active balances.
              </span>
            </label>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={voiding}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void confirmVoid(); }}
            disabled={voiding || !voidReason.trim() || (needsForce && !forceVoidConfirmed)}
            className="bg-red-600 hover:bg-red-700"
          >
            {voiding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Void entry
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <TollTransactionDetailOverlay
      isOpen={!!selectedTransaction}
      onClose={() => setSelectedTransaction(null)}
      transaction={selectedTransaction}
      trip={(selectedTransaction as any)?.linkedTrip || null}
      claim={selectedTransaction ? claims[selectedTransaction.id] : null}
    />
    </>
  );
}
