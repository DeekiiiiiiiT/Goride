import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { FuelDisputeService } from '../../services/fuelDisputeService';
import { DisputeReason, FuelDispute } from '../../types/fuel';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Badge } from "../ui/badge";

interface DisputeModalProps {
    isOpen: boolean;
    onClose: () => void;
    vehicleId: string;
    driverId: string;
    weekStart: string;
    weekEnd?: string;
    onSuccess?: () => void;
    existingDispute?: FuelDispute | null;
}

export function DisputeModal({ isOpen, onClose, vehicleId, driverId, weekStart, weekEnd, onSuccess, existingDispute }: DisputeModalProps) {
    const [reason, setReason] = useState<DisputeReason | ''>('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (existingDispute) {
        return (
           <Dialog open={isOpen} onOpenChange={onClose}>
               <DialogContent className="sm:max-w-[425px]">
                   <DialogHeader>
                       <div className="flex items-center justify-between pr-8">
                            <DialogTitle>Dispute Details</DialogTitle>
                            <Badge variant={
                                existingDispute.status === 'Resolved' ? 'default' :
                                existingDispute.status === 'Rejected' ? 'destructive' : 'secondary'
                            }>
                                {existingDispute.status}
                            </Badge>
                       </div>
                       <DialogDescription>
                           Submitted on {new Date(existingDispute.createdAt).toLocaleDateString()}
                       </DialogDescription>
                   </DialogHeader>
                   <div className="grid gap-4 py-4">
                       <div className="grid gap-1">
                           <Label className="text-muted-foreground text-xs uppercase tracking-wider">Reason</Label>
                           <p className="font-medium text-sm">{existingDispute.reason.replace(/_/g, ' ')}</p>
                       </div>
                       <div className="grid gap-1">
                           <Label className="text-muted-foreground text-xs uppercase tracking-wider">Description</Label>
                           <div className="p-3 bg-slate-50 rounded-md text-sm whitespace-pre-wrap">
                               {existingDispute.description}
                           </div>
                       </div>
                       
                       {existingDispute.adminResponse && (
                            <div className="grid gap-1 mt-2">
                               <Label className="text-indigo-600 font-semibold text-xs uppercase tracking-wider">Admin Response</Label>
                               <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-md text-sm text-indigo-900 whitespace-pre-wrap">
                                   {existingDispute.adminResponse}
                               </div>
                           </div>
                       )}
                   </div>
                   <DialogFooter>
                       <Button onClick={onClose}>Close</Button>
                   </DialogFooter>
               </DialogContent>
           </Dialog>
        );
   }

    const handleSubmit = async () => {
        if (!reason || !description) {
             toast.error("Please fill in all fields");
             return;
        }
        
        setIsSubmitting(true);
        try {
            await FuelDisputeService.createDispute({
                id: crypto.randomUUID(),
                weekStart,
                weekEnd,
                vehicleId,
                driverId,
                reason: reason as DisputeReason,
                description,
                status: 'Open',
                createdAt: new Date().toISOString()
            });
            toast.success("Dispute submitted successfully");
            onSuccess?.();
            onClose();
        } catch (e) {
            toast.error("Failed to submit dispute");
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Dispute Fuel Report</DialogTitle>
                    <DialogDescription>
                        Explain why you believe this week's fuel report is incorrect.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="reason">Reason</Label>
                        <Select onValueChange={(val) => setReason(val as DisputeReason)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a reason" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Trip_Log_Error">Trip Log Missing/Error</SelectItem>
                                <SelectItem value="Fuel_Transaction_Error">Fuel Transaction Error</SelectItem>
                                <SelectItem value="Mechanical_Issue">Mechanical Issue (Leak/Poor Efficiency)</SelectItem>
                                <SelectItem value="Theft_Suspected">Suspected Theft</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea 
                            id="description" 
                            placeholder="Provide details..." 
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting || !reason || !description}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Submit Dispute
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
