import React, { useState } from 'react';
import { useForm } from 'react-hook-form@7.55.0';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { Checkbox } from "../../ui/checkbox";
import { FixedExpenseConfig, ExpenseCategory, ExpenseFrequency } from '../../../types/expenses';
import { expenseService } from '../../../services/expenseService';
import { toast } from "sonner@2.0.3";
import { Loader2 } from "lucide-react";

interface AddFixedExpenseDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    vehicleId: string;
    expenseToEdit?: FixedExpenseConfig | null;
}

type FormData = {
    name: string;
    amount: string; // string for input handling
    frequency: ExpenseFrequency;
    category: ExpenseCategory;
    startDate: string;
    endDate?: string;
    vendor?: string;
    description?: string;
    autoRenew: boolean;
};

export const AddFixedExpenseDialog: React.FC<AddFixedExpenseDialogProps> = ({ 
    isOpen, 
    onClose, 
    onSaved, 
    vehicleId, 
    expenseToEdit 
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<FormData>({
        defaultValues: {
            name: expenseToEdit?.name || '',
            amount: expenseToEdit?.amount.toString() || '',
            frequency: expenseToEdit?.frequency || 'Monthly',
            category: expenseToEdit?.category || 'Insurance',
            startDate: expenseToEdit?.startDate || new Date().toISOString().split('T')[0],
            endDate: expenseToEdit?.endDate || '',
            vendor: expenseToEdit?.vendor || '',
            description: expenseToEdit?.description || '',
            autoRenew: expenseToEdit?.autoRenew ?? true
        }
    });

    // Reset form when dialog opens/changes or edit target changes
    React.useEffect(() => {
        if (isOpen) {
            reset({
                name: expenseToEdit?.name || '',
                amount: expenseToEdit?.amount.toString() || '',
                frequency: expenseToEdit?.frequency || 'Monthly',
                category: expenseToEdit?.category || 'Insurance',
                startDate: expenseToEdit?.startDate || new Date().toISOString().split('T')[0],
                endDate: expenseToEdit?.endDate || '',
                vendor: expenseToEdit?.vendor || '',
                description: expenseToEdit?.description || '',
                autoRenew: expenseToEdit?.autoRenew ?? true
            });
        }
    }, [isOpen, expenseToEdit, reset]);

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        try {
            const expensePayload: FixedExpenseConfig = {
                id: expenseToEdit?.id, // undefined for new
                vehicleId,
                name: data.name,
                amount: parseFloat(data.amount),
                currency: 'JMD', // Default for now
                frequency: data.frequency,
                category: data.category,
                startDate: data.startDate,
                endDate: data.endDate || undefined,
                vendor: data.vendor,
                description: data.description,
                autoRenew: data.autoRenew,
                // These are set by backend usually, but for type safety:
                createdAt: expenseToEdit?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await expenseService.saveFixedExpense(expensePayload);
            toast.success(expenseToEdit ? "Expense updated successfully" : "Expense added successfully");
            onSaved();
            onClose();
        } catch (error) {
            console.error("Failed to save expense:", error);
            toast.error("Failed to save expense");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{expenseToEdit ? "Edit Fixed Expense" : "Add Fixed Expense"}</DialogTitle>
                    <DialogDescription>
                        Configure a recurring cost for this vehicle.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Expense Name *</Label>
                            <Input 
                                id="name" 
                                placeholder="e.g. Comprehensive Insurance" 
                                {...register("name", { required: "Name is required" })} 
                            />
                            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount (JMD) *</Label>
                            <Input 
                                id="amount" 
                                type="number" 
                                step="0.01"
                                placeholder="0.00" 
                                {...register("amount", { required: "Amount is required", min: 0 })} 
                            />
                            {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="category">Category</Label>
                            <Select 
                                onValueChange={(val) => setValue("category", val as ExpenseCategory)} 
                                defaultValue={watch("category")}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Insurance">Insurance</SelectItem>
                                    <SelectItem value="Tracking">Tracking / Security</SelectItem>
                                    <SelectItem value="License">License / Registration</SelectItem>
                                    <SelectItem value="Lease">Lease / Financing</SelectItem>
                                    <SelectItem value="Parking">Parking</SelectItem>
                                    <SelectItem value="Software">Software / Apps</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="frequency">Frequency</Label>
                            <Select 
                                onValueChange={(val) => setValue("frequency", val as ExpenseFrequency)} 
                                defaultValue={watch("frequency")}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select frequency" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Weekly">Weekly</SelectItem>
                                    <SelectItem value="Monthly">Monthly</SelectItem>
                                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                                    <SelectItem value="Yearly">Yearly</SelectItem>
                                    <SelectItem value="One-time">One-time</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="startDate">Start Date *</Label>
                            <Input 
                                id="startDate" 
                                type="date" 
                                {...register("startDate", { required: "Start date is required" })} 
                            />
                            {errors.startDate && <p className="text-xs text-red-500">{errors.startDate.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="endDate">End Date (Optional)</Label>
                            <Input 
                                id="endDate" 
                                type="date" 
                                {...register("endDate")} 
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="vendor">Vendor / Provider (Optional)</Label>
                        <Input 
                            id="vendor" 
                            placeholder="e.g. ICWI, KingAlarm" 
                            {...register("vendor")} 
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Notes (Optional)</Label>
                        <Textarea 
                            id="description" 
                            placeholder="Policy number, contact details, etc." 
                            {...register("description")} 
                        />
                    </div>

                    <div className="flex flex-col space-y-1.5">
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="autoRenew" 
                                checked={watch("autoRenew")} 
                                onCheckedChange={(checked) => setValue("autoRenew", checked as boolean)} 
                            />
                            <Label htmlFor="autoRenew" className="cursor-pointer">Auto-renew this expense indefinitely</Label>
                        </div>
                        <p className="text-[0.8rem] text-muted-foreground ml-6">
                            When checked, the expense will be automatically projected into future years without an end date.
                        </p>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {expenseToEdit ? "Save Changes" : "Add Expense"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
