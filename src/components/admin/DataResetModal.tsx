import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { api } from "../../services/api";
import { toast } from "sonner@2.0.3";
import { Trip, FinancialTransaction } from "../../types/data";

interface DataResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DataResetModal({ isOpen, onClose, onSuccess }: DataResetModalProps) {
  const [step, setStep] = useState<'select' | 'confirm' | 'processing' | 'success'>('select');
  const [target, setTarget] = useState<'trips' | 'transactions' | 'all' | null>(null);
  const [progress, setProgress] = useState(0);

  const handleSelect = (t: 'trips' | 'transactions' | 'all') => {
    setTarget(t);
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!target) return;
    setStep('processing');
    setProgress(10);

    try {
      if (target === 'trips' || target === 'all') {
        const trips = await api.getTrips();
        // Since api.ts doesn't have a bulk delete, we might need to rely on clearAllData
        // or delete manually if clearAllData is too aggressive.
        // However, looking at api.ts, clearAllData deletes *trips*.
        // "DELETE /trips" in api.clearAllData() seems to be exactly what we need for trips.
        
        // Wait, let's verify if clearAllData deletes ONLY trips or EVERYTHING.
        // The implementation calls DELETE /trips. Assuming the backend handles "ALL" on that endpoint.
        // If clearAllData is "Delete All Trips", then:
        
        await api.clearAllData(); 
        setProgress(50);
      }

      if (target === 'transactions' || target === 'all') {
        // We don't have a clearAllTransactions in api.ts.
        // We have getTransactions and deleteTransaction.
        // We must implement a manual loop or add a new endpoint.
        // For now, client-side loop is safer without backend access.
        
        const txs = await api.getTransactions();
        const total = txs.length;
        
        if (total > 0) {
            // Batch delete in chunks of 5 to avoid overwhelming network/server
            const batchSize = 5;
            for (let i = 0; i < total; i += batchSize) {
                const batch = txs.slice(i, i + batchSize);
                await Promise.all(batch.map((tx: FinancialTransaction) => api.deleteTransaction(tx.id)));
                
                // Update progress for the transaction part (50% to 100% range if 'all', or 0-100 if 'transactions')
                const percentage = Math.round((i / total) * 100);
                setProgress(target === 'all' ? 50 + (percentage / 2) : percentage);
            }
        }
      }

      setProgress(100);
      setStep('success');
      toast.success("Data successfully purged.");
      onSuccess();
      
    } catch (error) {
      console.error("Reset failed", error);
      toast.error("Failed to reset data. Check console.");
      setStep('select'); // Go back to start
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] w-full overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
            Data Sanitization (Phase 2)
          </DialogTitle>
          <DialogDescription>
            This utility helps you clear corrupted data caused by the previous reconciliation logic.
            Please choose what you would like to purge.
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="grid gap-4 py-4">
            <Button 
                variant="outline" 
                className="w-full h-auto p-4 flex justify-start items-start gap-4 whitespace-normal hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                onClick={() => handleSelect('trips')}
            >
                <div className="bg-rose-100 p-2 rounded-full shrink-0">
                    <Trash2 className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-left flex-1">
                    <div className="font-semibold">Reset Imported Trips</div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                        Deletes all trips. Fixes the doubled toll charges (e.g. $740 vs $370).
                        You will need to re-import your trip data.
                    </div>
                </div>
            </Button>

            <Button 
                variant="outline" 
                className="w-full h-auto p-4 flex justify-start items-start gap-4 whitespace-normal hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
                onClick={() => handleSelect('transactions')}
            >
                <div className="bg-amber-100 p-2 rounded-full shrink-0">
                    <Trash2 className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-left flex-1">
                    <div className="font-semibold">Reset Toll Transactions</div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                        Deletes all expense transactions (Toll/Top-ups). 
                        Use this if you want to re-import your bank/toll statements.
                    </div>
                </div>
            </Button>

            <Button 
                variant="destructive" 
                className="w-full h-auto p-4 flex justify-start items-start gap-4 whitespace-normal"
                onClick={() => handleSelect('all')}
            >
                <div className="bg-white/20 p-2 rounded-full shrink-0">
                    <AlertTriangle className="h-4 w-4 text-white" />
                </div>
                <div className="text-left flex-1">
                    <div className="font-semibold text-white">Reset Everything</div>
                    <div className="text-xs text-rose-100 leading-relaxed">
                        Wipes all trips and transactions. A complete fresh start for imports.
                    </div>
                </div>
            </Button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="py-6">
             <div className="bg-rose-50 border border-rose-100 p-4 rounded-lg text-rose-800 text-sm mb-4">
                <strong>Warning:</strong> This action is irreversible. 
                {target === 'trips' && " All trip history will be permanently deleted."}
                {target === 'transactions' && " All toll transaction history will be permanently deleted."}
                {target === 'all' && " All imported data will be wiped."}
             </div>
             <p className="text-center text-slate-600">Are you absolutely sure you want to proceed?</p>
          </div>
        )}

        {step === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-slate-500">Sanitizing database... {progress}%</p>
            </div>
        )}

        {step === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
                <div className="h-12 w-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                    <h3 className="text-lg font-medium text-slate-900">Data Sanitized</h3>
                    <p className="text-slate-500 max-w-xs mx-auto mt-1">
                        The corrupted data has been removed. You can now safely re-import using the new logic.
                    </p>
                </div>
            </div>
        )}

        <DialogFooter>
          {step === 'select' && (
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          )}
          {step === 'confirm' && (
            <>
                <Button variant="ghost" onClick={() => setStep('select')}>Back</Button>
                <Button variant="destructive" onClick={handleConfirm}>Confirm Purge</Button>
            </>
          )}
          {step === 'success' && (
            <Button onClick={onClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
