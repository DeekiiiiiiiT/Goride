import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { TollProvider, TollTagStatus } from "../../types/vehicle";
import { Loader2 } from "lucide-react";

interface AddTollTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { provider: TollProvider; tagNumber: string; status: TollTagStatus }) => Promise<void>;
}

export function AddTollTagModal({ isOpen, onClose, onSave }: AddTollTagModalProps) {
  const [provider, setProvider] = useState<TollProvider>('JRC');
  const [tagNumber, setTagNumber] = useState('');
  const [status, setStatus] = useState<TollTagStatus>('Active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagNumber.trim()) {
      setError("Tag Number is required");
      return;
    }
    
    setError(null);
    setIsSubmitting(true);
    try {
      await onSave({ provider, tagNumber, status });
      // Reset form
      setProvider('JRC');
      setTagNumber('');
      setStatus('Active');
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
          <DialogTitle>Add New Toll Tag</DialogTitle>
          <DialogDescription>
            Enter the details of the new toll tag to add it to inventory.
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
              Save Tag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
