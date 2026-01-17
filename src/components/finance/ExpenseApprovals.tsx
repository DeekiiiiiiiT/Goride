import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Check, X, Fuel, Wrench, Receipt, Split } from "lucide-react";
import { FinancialTransaction, ExpenseSplitRule } from "../../types/data";
import { api } from "../../services/api";
import { tierService } from "../../services/tierService";
import { toast } from "sonner@2.0.3";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface ExpenseApprovalsProps {
  transactions: FinancialTransaction[];
  onUpdate: () => void;
}

export function ExpenseApprovals({ transactions, onUpdate }: ExpenseApprovalsProps) {
  const pendingExpenses = transactions.filter(t => 
    t.type === 'Expense' && t.status === 'Pending'
  );

  const [selectedTx, setSelectedTx] = useState<FinancialTransaction | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  
  // Rules State
  const [splitRules, setSplitRules] = useState<ExpenseSplitRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');

  // Approval Form State
  const [rejectReason, setRejectReason] = useState("");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [companyShare, setCompanyShare] = useState(50); // %
  const [adminNotes, setAdminNotes] = useState("");

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    const rules = await tierService.getSplitRules();
    setSplitRules(rules.filter(r => r.category === 'Fuel'));
  };

  const handleAction = (tx: FinancialTransaction, action: 'approve' | 'reject') => {
    setSelectedTx(tx);
    setAdminNotes("");
    if (action === 'reject') {
      setRejectReason("");
      setIsRejectDialogOpen(true);
    } else {
      const isFuel = tx.category === 'Fuel';
      setSplitEnabled(isFuel);
      
      if (isFuel) {
        // Try to find a default rule or the first one
        const defaultRule = splitRules.find(r => r.isDefault) || splitRules[0];
        if (defaultRule) {
            setSelectedRuleId(defaultRule.id);
            setCompanyShare(defaultRule.companyShare);
        } else {
            setCompanyShare(50);
        }
      } else {
        setCompanyShare(50);
      }
      setIsApproveDialogOpen(true);
    }
  };

  const handleRuleChange = (ruleId: string) => {
    setSelectedRuleId(ruleId);
    const rule = splitRules.find(r => r.id === ruleId);
    if (rule) {
        setCompanyShare(rule.companyShare);
    }
  };

  const confirmReject = async () => {
    if (!selectedTx) return;
    try {
      await api.saveTransaction({
        ...selectedTx,
        status: 'Failed',
        notes: selectedTx.notes + `\n[Admin Rejected]: ${rejectReason}`
      });
      toast.success("Expense Rejected");
      onUpdate();
    } catch (e) {
      toast.error("Failed to reject expense");
    } finally {
      setIsRejectDialogOpen(false);
      setSelectedTx(null);
    }
  };

  const confirmApprove = async () => {
    if (!selectedTx) return;
    try {
      // 1. Update original transaction to Completed
      const updatedOriginal = {
        ...selectedTx,
        status: 'Completed',
        notes: adminNotes ? (selectedTx.notes + `\n[Admin]: ${adminNotes}`) : selectedTx.notes
      };
      
      await api.saveTransaction(updatedOriginal as FinancialTransaction);

      // 2. Handle Split (Create Reimbursement/Credit)
      if (splitEnabled) {
        const amount = Math.abs(selectedTx.amount);
        const creditAmount = amount * (companyShare / 100);
        
        // Add scenario name to description if available
        const ruleName = splitRules.find(r => r.id === selectedRuleId)?.name || '';
        const desc = ruleName 
            ? `Fuel Reimbursement (${ruleName}: ${companyShare}%)`
            : `Company Share (${companyShare}%) of Fuel Expense`;

        const reimbursementTx: Partial<FinancialTransaction> = {
          id: crypto.randomUUID(),
          date: new Date().toISOString().split('T')[0],
          time: format(new Date(), 'HH:mm:ss'),
          driverId: selectedTx.driverId,
          driverName: selectedTx.driverName,
          type: 'Adjustment',
          category: 'Fuel Reimbursement',
          description: desc,
          amount: creditAmount, // Positive
          status: 'Completed',
          paymentMethod: 'Bank Transfer',
          isReconciled: true,
          referenceNumber: selectedTx.id // Link to original
        };

        await api.saveTransaction(reimbursementTx);
        toast.success(`Expense Approved with ${companyShare}% Split`);
      } else {
        toast.success("Expense Approved");
      }
      
      onUpdate();
    } catch (e) {
      console.error(e);
      toast.error("Failed to approve expense");
    } finally {
      setIsApproveDialogOpen(false);
      setSelectedTx(null);
    }
  };

  if (pendingExpenses.length === 0) {
    return (
      <Card className="bg-slate-50 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="bg-white p-4 rounded-full shadow-sm mb-3">
                <Check className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-slate-900">All Caught Up!</h3>
            <p className="text-slate-500 text-sm max-w-sm mt-1">
                No pending expenses to review.
            </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {pendingExpenses.map(tx => (
        <Card key={tx.id} className="bg-white hover:bg-slate-50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                {tx.category === 'Fuel' ? <Fuel className="h-5 w-5 text-orange-600" /> : <Wrench className="h-5 w-5 text-blue-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="font-semibold text-slate-900">{tx.category} Request</h4>
                        <p className="text-sm text-slate-500">
                            {tx.driverName} • {format(new Date(tx.date), 'MMM d')}
                        </p>
                    </div>
                    <div className="text-right">
                        <span className="font-bold text-slate-900 text-lg">
                            ${Math.abs(tx.amount).toFixed(2)}
                        </span>
                    </div>
                </div>
                
                {tx.description && (
                    <div className="bg-slate-100 p-2 rounded text-xs text-slate-700 mt-2">
                        {tx.description}
                    </div>
                )}
                
                <div className="flex items-center gap-4 mt-3">
                    {tx.receiptUrl && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => window.open(tx.receiptUrl, '_blank')}>
                            <Receipt className="h-3 w-3 mr-1" /> View Receipt
                        </Button>
                    )}
                    {tx.odometer && (
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                            Odometer: {tx.odometer} km
                        </span>
                    )}
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0 ml-2">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAction(tx, 'approve')}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleAction(tx, 'reject')}>
                      <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Reject Expense</DialogTitle>
                <DialogDescription>
                    Please provide a reason for rejecting this request. The driver will be notified.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Label>Reason</Label>
                <Input 
                    placeholder="e.g. Duplicate entry, Invalid receipt..." 
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                />
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setIsRejectDialogOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={confirmReject}>Reject Expense</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>Approve Expense</DialogTitle>
                <DialogDescription>
                    Review and finalize the expense details.
                </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border">
                    <span className="font-medium text-slate-700">Total Amount</span>
                    <span className="font-bold text-xl">${selectedTx ? Math.abs(selectedTx.amount).toFixed(2) : '0.00'}</span>
                </div>

                {selectedTx?.category === 'Fuel' && (
                    <div className="space-y-4 border-t pt-4">
                        <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2">
                                <Split className="h-4 w-4 text-indigo-600" />
                                Apply Fuel Split
                            </Label>
                            <Switch checked={splitEnabled} onCheckedChange={setSplitEnabled} />
                        </div>
                        
                        {splitEnabled && (
                            <div className="space-y-3 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                                <div className="space-y-2 mb-4">
                                    <Label className="text-xs text-indigo-900">Select Scenario</Label>
                                    <Select value={selectedRuleId} onValueChange={handleRuleChange}>
                                        <SelectTrigger className="bg-white border-indigo-200">
                                            <SelectValue placeholder="Select a split scenario" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {splitRules.map(rule => (
                                                <SelectItem key={rule.id} value={rule.id}>
                                                    {rule.name} (Co: {rule.companyShare}%)
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex justify-between text-xs text-indigo-900 font-medium">
                                    <span>Driver Share</span>
                                    <span>Company Share ({companyShare}%)</span>
                                </div>
                                <Slider 
                                    value={[companyShare]} 
                                    min={0} 
                                    max={100} 
                                    step={1} 
                                    onValueChange={(val) => setCompanyShare(val[0])}
                                    className="py-2"
                                />
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">
                                        ${selectedTx ? (Math.abs(selectedTx.amount) * ((100-companyShare)/100)).toFixed(2) : 0}
                                    </span>
                                    <span className="text-indigo-700 font-bold">
                                        ${selectedTx ? (Math.abs(selectedTx.amount) * (companyShare/100)).toFixed(2) : 0}
                                    </span>
                                </div>
                                <p className="text-[10px] text-indigo-600">
                                    A credit of <strong>${selectedTx ? (Math.abs(selectedTx.amount) * (companyShare/100)).toFixed(2) : 0}</strong> will be added to the driver's wallet.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    <Label>Admin Notes (Optional)</Label>
                    <Input 
                        placeholder="Internal notes..." 
                        value={adminNotes}
                        onChange={e => setAdminNotes(e.target.value)}
                    />
                </div>
            </div>

            <DialogFooter>
                <Button variant="ghost" onClick={() => setIsApproveDialogOpen(false)}>Cancel</Button>
                <Button onClick={confirmApprove} className="bg-emerald-600 hover:bg-emerald-700">
                    Confirm Approval
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
