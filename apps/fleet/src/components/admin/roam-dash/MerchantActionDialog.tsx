import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { MerchantStatusBadge } from "./MerchantStatusBadge";
import type { MerchantVerificationStatus } from "../../../services/dashMerchantVerificationService";

interface MerchantActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchantName: string;
  targetStatus: MerchantVerificationStatus | null;
  busy: boolean;
  onConfirm: (payload: { notes?: string; internal_notes?: string }) => Promise<void> | void;
}

const ACTION_COPY: Record<
  MerchantVerificationStatus,
  {
    title: string;
    description: string;
    confirmLabel: string;
    confirmTone: "default" | "success" | "danger";
    notesLabel: string;
    notesPlaceholder: string;
    notesRequired: boolean;
    showInternal: boolean;
  }
> = {
  in_review: {
    title: "Start Review",
    description: "Marks this application as actively being reviewed. The merchant will see an updated banner.",
    confirmLabel: "Start Review",
    confirmTone: "default",
    notesLabel: "Internal notes (optional)",
    notesPlaceholder: "Anything to flag for the team before reviewing...",
    notesRequired: false,
    showInternal: false,
  },
  docs_requested: {
    title: "Request more info",
    description: "The merchant will receive an email and in-app notification with the message below.",
    confirmLabel: "Request info",
    confirmTone: "default",
    notesLabel: "Message to merchant",
    notesPlaceholder: "e.g. Please upload a copy of your food handler's permit.",
    notesRequired: true,
    showInternal: true,
  },
  approved: {
    title: "Approve merchant",
    description: "The restaurant will go live on Roam Dash and be visible to customers immediately.",
    confirmLabel: "Approve",
    confirmTone: "success",
    notesLabel: "Internal notes (optional)",
    notesPlaceholder: "Optional notes that only the admin team will see.",
    notesRequired: false,
    showInternal: false,
  },
  rejected: {
    title: "Reject application",
    description: "The merchant will be notified with the reason below. They can edit and resubmit.",
    confirmLabel: "Reject",
    confirmTone: "danger",
    notesLabel: "Reason (visible to merchant)",
    notesPlaceholder: "Explain why the application was not approved.",
    notesRequired: true,
    showInternal: true,
  },
  pending: {
    title: "Move back to Pending",
    description: "Resets the application to the pending queue.",
    confirmLabel: "Confirm",
    confirmTone: "default",
    notesLabel: "Internal notes (optional)",
    notesPlaceholder: "",
    notesRequired: false,
    showInternal: false,
  },
};

export function MerchantActionDialog({
  open,
  onOpenChange,
  merchantName,
  targetStatus,
  busy,
  onConfirm,
}: MerchantActionDialogProps) {
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  useEffect(() => {
    if (open) {
      setNotes("");
      setInternalNotes("");
    }
  }, [open, targetStatus]);

  if (!targetStatus) return null;
  const copy = ACTION_COPY[targetStatus];

  const handleSubmit = async () => {
    if (copy.notesRequired && !notes.trim()) return;
    await onConfirm({
      notes: notes.trim() || undefined,
      internal_notes: internalNotes.trim() || undefined,
    });
  };

  const confirmBtnClass =
    copy.confirmTone === "success"
      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
      : copy.confirmTone === "danger"
      ? "bg-rose-600 hover:bg-rose-500 text-white"
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Merchant</p>
                <p className="font-medium">{merchantName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">New status</p>
                <MerchantStatusBadge status={targetStatus} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="action-notes">
              {copy.notesLabel}
              {copy.notesRequired && <span className="text-rose-500 ml-1">*</span>}
            </Label>
            <Textarea
              id="action-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={copy.notesPlaceholder}
              rows={4}
              className="resize-y"
            />
          </div>

          {copy.showInternal && (
            <div className="space-y-2">
              <Label htmlFor="action-internal-notes">Internal notes (only admins see this)</Label>
              <Textarea
                id="action-internal-notes"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Private context for the admin team..."
                rows={3}
                className="resize-y"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={busy || (copy.notesRequired && !notes.trim())}
            className={confirmBtnClass}
          >
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {copy.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
