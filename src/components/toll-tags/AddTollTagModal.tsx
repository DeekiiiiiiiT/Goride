import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";
import { format } from "date-fns";
import { TollProvider, TollTagStatus, TollTag } from "../../types/vehicle";
import { Loader2, Calendar as CalendarIcon } from "lucide-react";

interface AddTollTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { provider: TollProvider; tagNumber: string; status: TollTagStatus; dateAdded?: string }) => Promise<void>;
  initialData?: TollTag;
}

export function AddTollTagModal({ isOpen, onClose, onSave, initialData }: AddTollTagModalProps) {
  const [provider, setProvider] = useState<TollProvider>('JRC');
  const [tagNumber, setTagNumber] = useState('');
  const [status, setStatus] = useState<TollTagStatus>('Active');
  const [dateAdded, setDateAdded] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setProvider(initialData.provider);
        setTagNumber(initialData.tagNumber);
        setStatus(initialData.status);
        setDateAdded(initialData.dateAdded ? new Date(initialData.dateAdded) : undefined);
      } else {
        setProvider('JRC');
        setTagNumber('');
        setStatus('Active');
        setDateAdded(undefined);
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagNumber.trim()) {
      setError("Tag Number is required");
      return;
    }
    
    setError(null);
    setIsSubmitting(true);
    try {
      await onSave({ 
        provider, 
        tagNumber, 
        status,
        dateAdded: dateAdded ? dateAdded.toISOString() : undefined
      });
      // Form reset is handled by useEffect when reopened
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to save tag");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Toll Tag" : "Add New Toll Tag"}</DialogTitle>
          <DialogDescription>
            {initialData ? "Update the details of the toll tag." : "Enter the details of the new toll tag to add it to inventory."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as TollProvider)}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="JRC">JRC (Jamaica Infrastructure)</SelectItem>
                <SelectItem value="T-Tag">T-Tag (NROCC)</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagNumber">Tag Serial Number</Label>
            <Input 
              id="tagNumber" 
              value={tagNumber} 
              onChange={(e) => setTagNumber(e.target.value)} 
              placeholder="e.g. 212100286450"
            />
          </div>

          <div className="space-y-2">
            <Label>Date Added</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateAdded && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateAdded ? format(dateAdded, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateAdded}
                  onSelect={setDateAdded}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Initial Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TollTagStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
                <SelectItem value="Damaged">Damaged</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData ? "Save Changes" : "Save Tag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
