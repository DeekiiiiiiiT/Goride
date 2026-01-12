import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Trip } from "../../types/data";
import { AlertTriangle } from "lucide-react";

interface TripIssueDialogProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (tripId: string, reason: string) => Promise<void>;
}

export function TripIssueDialog({ trip, open, onOpenChange, onSubmit }: TripIssueDialogProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!trip) return null;

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(trip.id, reason);
      onOpenChange(false);
      setReason(""); // Reset after success
    } catch (error) {
      console.error("Failed to submit issue", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Flag Issue
          </DialogTitle>
          <DialogDescription>
            Report an issue with this trip. This will flag the trip for review by the fleet manager.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="issue-reason">Reason for flagging</Label>
            <Textarea
              id="issue-reason"
              placeholder="Describe the issue (e.g., fare discrepancy, route complaint)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-32"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!reason.trim() || isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
