import { Info, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@roam/ui';

const DISMISS_KEY = 'roam_evidence_retention_notice_dismissed';

interface EvidenceRetentionNoticeProps {
  className?: string;
  /** Override localStorage dismiss (e.g. demo page) */
  forceShow?: boolean;
  onDismiss?: () => void;
}

export function EvidenceRetentionNotice({
  className,
  forceShow = false,
  onDismiss,
}: EvidenceRetentionNoticeProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (forceShow) return false;
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2.5 text-sm text-slate-700',
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
      <p className="flex-1 leading-snug">
        Receipt photos are kept <strong>14 days</strong> after approval for verification, then
        removed. Your entered amounts and dates are saved permanently.
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-indigo-100 hover:text-slate-700"
        aria-label="Dismiss notice"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Reset dismiss state (tests / demo) */
export function resetEvidenceRetentionNoticeDismiss(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}
