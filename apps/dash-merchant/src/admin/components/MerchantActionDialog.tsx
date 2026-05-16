import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { MerchantStatusBadge } from './MerchantStatusBadge';
import type { MerchantVerificationStatus } from '../services/dashAdminService';

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
    confirmTone: 'default' | 'success' | 'danger';
    notesLabel: string;
    notesPlaceholder: string;
    notesRequired: boolean;
    showInternal: boolean;
  }
> = {
  in_review: {
    title: 'Start Review',
    description:
      'Marks this application as actively being reviewed. The merchant will see an updated banner.',
    confirmLabel: 'Start Review',
    confirmTone: 'default',
    notesLabel: 'Internal notes (optional)',
    notesPlaceholder: 'Anything to flag for the team before reviewing...',
    notesRequired: false,
    showInternal: false,
  },
  docs_requested: {
    title: 'Request more info',
    description:
      'The merchant will receive an email and in-app notification with the message below.',
    confirmLabel: 'Request info',
    confirmTone: 'default',
    notesLabel: 'Message to merchant',
    notesPlaceholder: 'e.g. Please upload a copy of your food handler permit.',
    notesRequired: true,
    showInternal: true,
  },
  approved: {
    title: 'Approve merchant',
    description:
      'The restaurant will go live on Roam Dash and be visible to customers immediately.',
    confirmLabel: 'Approve',
    confirmTone: 'success',
    notesLabel: 'Internal notes (optional)',
    notesPlaceholder: 'Optional notes that only the admin team will see.',
    notesRequired: false,
    showInternal: false,
  },
  rejected: {
    title: 'Reject application',
    description:
      'The merchant will be notified with the reason below. They can edit and resubmit.',
    confirmLabel: 'Reject',
    confirmTone: 'danger',
    notesLabel: 'Reason (visible to merchant)',
    notesPlaceholder: 'Explain why the application was not approved.',
    notesRequired: true,
    showInternal: true,
  },
  pending: {
    title: 'Move back to Pending',
    description: 'Resets the application to the pending queue.',
    confirmLabel: 'Confirm',
    confirmTone: 'default',
    notesLabel: 'Internal notes (optional)',
    notesPlaceholder: '',
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
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  useEffect(() => {
    if (open) {
      setNotes('');
      setInternalNotes('');
    }
  }, [open, targetStatus]);

  if (!open || !targetStatus) return null;
  const copy = ACTION_COPY[targetStatus];

  const handleSubmit = async () => {
    if (copy.notesRequired && !notes.trim()) return;
    await onConfirm({
      notes: notes.trim() || undefined,
      internal_notes: internalNotes.trim() || undefined,
    });
  };

  const confirmBtnClass =
    copy.confirmTone === 'success'
      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
      : copy.confirmTone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-500 text-white'
      : 'bg-slate-700 hover:bg-slate-600 text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      <div className="relative bg-slate-900 border border-slate-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">{copy.title}</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-slate-400">{copy.description}</p>

          <div className="rounded-md border border-slate-700 bg-slate-800/50 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">Merchant</p>
                <p className="font-medium text-white">{merchantName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">New status</p>
                <MerchantStatusBadge status={targetStatus} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              {copy.notesLabel}
              {copy.notesRequired && <span className="text-rose-500 ml-1">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={copy.notesPlaceholder}
              rows={4}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-y"
            />
          </div>

          {copy.showInternal && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                Internal notes (only admins see this)
              </label>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Private context for the admin team..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-y"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-800">
          <button
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={busy || (copy.notesRequired && !notes.trim())}
            className={`px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 ${confirmBtnClass}`}
          >
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />}
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
