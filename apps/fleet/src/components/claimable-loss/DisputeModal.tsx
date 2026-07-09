import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Copy, Check, ExternalLink, Send } from "lucide-react";
import { FinancialTransaction, Trip, Claim } from "../../types/data";
import { MatchResult, TollFinancials } from "../../utils/tollReconciliation";
import { toast } from "sonner@2.0.3";

interface DisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  lossItem: { transaction: FinancialTransaction, match: MatchResult } | null;
  claim?: Claim | null;
  financials?: TollFinancials;
  onClaimSuccess?: () => void;
  onCreateClaim?: (claim: Partial<Claim>) => Promise<unknown>;
  onUpdateClaim?: (claim: Claim) => Promise<unknown>;
}

export function DisputeModal({
  isOpen,
  onClose,
  lossItem,
  claim,
  financials: financialsProp,
  onClaimSuccess,
  onCreateClaim,
  onUpdateClaim,
}: DisputeModalProps) {
  const [copied, setCopied] = useState(false);
  const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isSending, setIsSending] = useState(false);

  const open = isOpen && !!lossItem;
  const transaction = lossItem?.transaction;
  const match = lossItem?.match;
  const trip = match?.trip;

  const financials = financialsProp ?? (transaction && trip ? {
    cost: Math.abs(transaction.amount),
    platformRefund: trip.tollCharges || 0,
    creditsApplied: 0,
    disputeRefund: 0,
    driverRecovered: 0,
    fleetAbsorbed: 0,
    totalRecovered: trip.tollCharges || 0,
    netLoss: Math.max(0, Math.abs(transaction.amount) - (trip.tollCharges || 0)),
    status: 'Partial Loss' as const,
  } : null);

  const tollCost = financials?.cost ?? 0;
  const creditsReceived = financials?.totalRecovered ?? 0;
  const missingAmount = financials?.netLoss ?? 0;

  const tripDate = trip ? new Date(trip.requestTime || trip.date) : new Date();
  const message = trip && transaction ? `Issue: Toll Underpayment
Trip ID: ${trip.id}
Trip Date: ${tripDate.toLocaleDateString()} at ${tripDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
Pickup: ${trip.pickupLocation?.split(',')[0]}
Dropoff: ${trip.dropoffLocation?.split(',')[0]}

I was charged $${tollCost.toFixed(2)} for the toll at "${transaction.description}", but only reimbursed $${creditsReceived.toFixed(2)}.

Please adjust the fare to include the missing $${missingAmount.toFixed(2)}.` : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Dispute message copied to clipboard");
    } catch (err) {
      try {
        if (textAreaRef.current) {
          textAreaRef.current.select();
          textAreaRef.current.setSelectionRange(0, 99999);
          const successful = document.execCommand('copy');
          if (successful) {
            setCopied(true);
            toast.success("Dispute message copied to clipboard");
            window.getSelection()?.removeAllRanges();
            textAreaRef.current.blur();
          } else {
            throw new Error("execCommand failed");
          }
        } else {
          throw new Error("Textarea ref not found");
        }
      } catch (fallbackErr) {
        console.error("Copy failed", fallbackErr);
        toast.error("Could not copy text automatically. Please select and copy manually.");
      }
    }
    
    if (copied) {
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendToDriver = async () => {
    if (!transaction || !trip) return;

    if (claim?.status === 'Sent_to_Driver' || claim?.status === 'Submitted_to_Uber') {
      toast.info('This claim is already with the driver or Uber');
      onClaimSuccess?.();
      onClose();
      return;
    }

    setIsSending(true);
    try {
      const payload = {
        status: 'Sent_to_Driver' as const,
        amount: missingAmount,
        expectedAmount: tollCost,
        paidAmount: creditsReceived,
        message,
        updatedAt: new Date().toISOString(),
      };

      if (claim && onUpdateClaim) {
        await onUpdateClaim({ ...claim, ...payload });
      } else if (onCreateClaim) {
        await onCreateClaim({
          driverId: trip.driverId || 'unknown_driver',
          tripId: trip.id,
          transactionId: transaction.id,
          type: 'Toll_Refund',
          subject: `Toll Refund: ${trip.pickupLocation?.split(',')[0] || 'Unknown Location'}`,
          tripDate: trip.requestTime || trip.date,
          pickup: trip.pickupLocation,
          dropoff: trip.dropoffLocation,
          date: transaction.date,
          vehicleId: transaction.vehicleId,
          driverName: trip.driverName,
          ...payload,
        });
      } else {
        throw new Error('No claim handler available');
      }
      toast.success("Claim sent to driver successfully");
      onClaimSuccess?.();
      onClose();
    } catch (e) {
      toast.error("Failed to send claim");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Dispute Kit</DialogTitle>
          <DialogDescription>
            Use this information to submit a fare review to Uber Support.
          </DialogDescription>
        </DialogHeader>

        {lossItem && financials && (
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-slate-50 rounded-md border text-center">
                <div className="text-xs text-slate-500 uppercase font-semibold">Toll Cost</div>
                <div className="text-lg font-bold text-slate-900">${tollCost.toFixed(2)}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-md border text-center">
                <div className="text-xs text-slate-500 uppercase font-semibold">Credits Received</div>
                <div className="text-lg font-bold text-emerald-600">${creditsReceived.toFixed(2)}</div>
              </div>
              <div className="p-3 bg-orange-50 rounded-md border border-orange-100 text-center">
                <div className="text-xs text-orange-600 uppercase font-semibold">Missing</div>
                <div className="text-lg font-bold text-orange-700">-${missingAmount.toFixed(2)}</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Suggested Message for Support
                </label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 text-xs gap-1.5"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy Text"}
                </Button>
              </div>
              <Textarea 
                ref={textAreaRef}
                className="h-40 font-mono text-sm bg-slate-50"
                readOnly
                value={message} 
              />
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between gap-4">
          <div className="text-xs text-slate-400 flex items-center">
             <ExternalLink className="h-3 w-3 mr-1" />
             Open Uber Driver App to paste
          </div>
          <div className="flex gap-2">
             <Button type="button" variant="outline" onClick={onClose}>
               Cancel
             </Button>
             <Button type="button" onClick={handleSendToDriver} disabled={isSending || !lossItem}>
               {isSending ? "Sending..." : <>Send to Driver <Send className="ml-2 h-3 w-3" /></>}
             </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
