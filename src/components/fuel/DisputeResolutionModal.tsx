import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { FuelDispute, DisputeStatus } from '../../types/fuel';
import { Badge } from "../ui/badge";
import { Loader2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { FuelDisputeService } from '../../services/fuelDisputeService';

interface DisputeResolutionModalProps {
    isOpen: boolean;
    onClose: () => void;
    dispute: FuelDispute | null;
    onSave: (updatedDispute: FuelDispute) => void;
    onCreateAdjustment?: () => void;
}

export function DisputeResolutionModal({ isOpen, onClose, dispute, onSave, onCreateAdjustment }: DisputeResolutionModalProps) {
    const [status, setStatus] = useState<DisputeStatus>('Open');
    const [response, setResponse] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (dispute) {
            setStatus(dispute.status);
            setResponse(dispute.adminResponse || '');
        }
    }, [dispute]);

    const handleSave = async () => {
        if (!dispute) return;
        if (status === 'Open') {
            toast.error("Please select a resolution status (Resolved or Rejected)");
            return;
        }

        setIsSubmitting(true);
        try {
            const updated: FuelDispute = {
                ...dispute,
                status,
                adminResponse: response
            };

            await FuelDisputeService.updateDispute(updated);
            onSave(updated);
            toast.success("Dispute updated successfully");
            onClose();
        } catch (e) {
            console.error(e);
            toast.error("Failed to update dispute");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!dispute) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Resolve Dispute</DialogTitle>
                    <DialogDescription>
                        Review the driver's dispute and provide a resolution.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                    {/* Driver's Submission */}
                    <div className="p-4 bg-slate-50 rounded-lg border space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <Label className="text-xs text-slate-500 uppercase font-bold">Driver's Reason</Label>
                                <p className="font-medium text-slate-900">{dispute.reason.replace(/_/g, ' ')}</p>
                            </div>
                            <div className="text-right">
                                <Label className="text-xs text-slate-500 uppercase font-bold">Date</Label>
                                <p className="text-sm text-slate-700">{new Date(dispute.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                        <div>
                             <Label className="text-xs text-slate-500 uppercase font-bold">Description</Label>
                             <p className="text-sm text-slate-800 whitespace-pre-wrap">{dispute.description}</p>
                        </div>
                    </div>

                    {/* Admin Resolution */}
                    <div className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="status">Resolution Status</Label>
                            <Select value={status} onValueChange={(val) => setStatus(val as DisputeStatus)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Open">Open (Pending)</SelectItem>
                                    <SelectItem value="Resolved">Resolved (Accepted)</SelectItem>
                                    <SelectItem value="Rejected">Rejected</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="response">Admin Response / Notes</Label>
                            <Textarea 
                                id="response" 
                                placeholder="Explain the decision..." 
                                value={response}
                                onChange={(e) => setResponse(e.target.value)}
                                className="min-h-[100px]"
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    {onCreateAdjustment && (
                        <Button variant="secondary" onClick={onCreateAdjustment} className="mr-auto" disabled={isSubmitting}>
                            <TrendingUp className="mr-2 h-4 w-4" />
                            Create Adjustment
                        </Button>
                    )}
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Resolution
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
