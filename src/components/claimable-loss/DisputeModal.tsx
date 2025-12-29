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
import { FinancialTransaction, Trip } from "../../types/data";
import { MatchResult } from "../../utils/tollReconciliation";
import { toast } from "sonner";
import { useClaims } from "../../hooks/useClaims";

interface DisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  lossItem: { transaction: FinancialTransaction, match: MatchResult } | null;
}

export function DisputeModal({ isOpen, onClose, lossItem }: DisputeModalProps) {
  const [copied, setCopied] = useState(false);
  const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
  const { createClaim } = useClaims();
  const [isSending, setIsSending] = useState(false);

  if (!lossItem) return null;

  const { transaction, match } = lossItem;
  const { trip, varianceAmount } = match;
  
  const tollCost = Math.abs(transaction.amount);
  const uberRefund = trip.tollCharges || 0;
  const missingAmount = Math.abs(varianceAmount || (tollCost - uberRefund));

  // Generate the dispute message
  const tripDate = new Date(trip.requestTime || trip.date);
  const message = `Issue: Toll Underpayment
Trip ID: ${trip.id}
Trip Date: ${tripDate.toLocaleDateString()} at ${tripDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
Pickup: ${trip.pickupLocation?.split(',')[0]}
Dropoff: ${trip.dropoffLocation?.split(',')[0]}

I was charged $${tollCost.toFixed(2)} for the toll at "${transaction.description}", but only reimbursed $${uberRefund.toFixed(2)}.

Please adjust the fare to include the missing $${missingAmount.toFixed(2)}.`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Dispute message copied to clipboard");
    } catch (err) {
      // Fallback: Select the text in the visible Textarea and execute copy command
      try {
        if (textAreaRef.current) {
          textAreaRef.current.select();
          textAreaRef.current.setSelectionRange(0, 99999); // For mobile devices
          
          const successful = document.execCommand('copy');
          
          if (successful) {
            setCopied(true);
            toast.success("Dispute message copied to clipboard");
            // Optional: deselect after copying
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
    setIsSending(true);
    try {
        await createClaim({
           driverId: trip.driverId || 'unknown_driver',
           tripId: trip.id,
           transactionId: transaction.id,
           type: 'Toll_Refund',
           status: 'Sent_to_Driver',
           amount: missingAmount,
           expectedAmount: tollCost,
           paidAmount: uberRefund,
           subject: `Toll Refund: ${trip.pickupLocation?.split(',')[0] || 'Unknown Location'}`,
           message: message,
           tripDate: trip.requestTime || trip.date,
           pickup: trip.pickupLocation,
           dropoff: trip.dropoffLocation
        });
        toast.success("Claim sent to driver successfully");
        onClose();
    } catch (e) {
        toast.error("Failed to send claim");
    } finally {
        setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Dispute Kit</DialogTitle>
          <DialogDescription>
            Use this information to submit a fare review to Uber Support.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 rounded-md border text-center">
                    <div className="text-xs text-slate-500 uppercase font-semibold">Toll Cost</div>
                    <div className="text-lg font-bold text-slate-900">${tollCost.toFixed(2)}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-md border text-center">
                    <div className="text-xs text-slate-500 uppercase font-semibold">Reimbursed</div>
                    <div className="text-lg font-bold text-emerald-600">${uberRefund.toFixed(2)}</div>
                </div>
                <div className="p-3 bg-orange-50 rounded-md border border-orange-100 text-center">
                    <div className="text-xs text-orange-600 uppercase font-semibold">Missing</div>
                    <div className="text-lg font-bold text-orange-700">-${missingAmount.toFixed(2)}</div>
                </div>
            </div>

            {/* Message Generator */}
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

        <DialogFooter className="sm:justify-between gap-4">
          <div className="text-xs text-slate-400 flex items-center">
             <ExternalLink className="h-3 w-3 mr-1" />
             Open Uber Driver App to paste
          </div>
          <div className="flex gap-2">
             <Button type="button" variant="outline" onClick={onClose}>
               Cancel
             </Button>
             <Button type="button" onClick={handleSendToDriver} disabled={isSending}>
               {isSending ? "Sending..." : <>Send to Driver <Send className="ml-2 h-3 w-3" /></>}
             </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
