import React, { useState } from 'react';
import {
  Clock,
  Eye,
  FileQuestion,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Pencil,
} from 'lucide-react';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import type { Merchant, VerificationStatus } from '../hooks/useMerchant';

interface VerificationStatusBannerProps {
  merchant: Merchant;
  onEdit?: () => void;
  onResubmit?: () => void;
  onRefresh?: () => void;
}

const STATUS_STYLE: Record<
  VerificationStatus,
  {
    bg: string;
    border: string;
    text: string;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
  }
> = {
  pending: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: Clock,
    title: 'Application Submitted',
  },
  in_review: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: Eye,
    title: 'Application Under Review',
  },
  docs_requested: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    icon: FileQuestion,
    title: 'Additional Information Needed',
  },
  approved: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    icon: CheckCircle2,
    title: "You're live on Roam Dash!",
  },
  rejected: {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-800',
    icon: XCircle,
    title: 'Application Not Approved',
  },
};

export function VerificationStatusBanner({
  merchant,
  onEdit,
  onResubmit,
  onRefresh,
}: VerificationStatusBannerProps) {
  const [resubmitting, setResubmitting] = useState(false);
  const status = (merchant.verification_status || 'pending') as VerificationStatus;

  if (status === 'approved') {
    // Phase 1: don't render the approved banner on every page load (avoids
    // shouting at merchants forever). The realtime listener still toasts on
    // the moment of approval.
    return null;
  }

  const style = STATUS_STYLE[status];
  const Icon = style.icon;

  const handleResubmit = async () => {
    setResubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/resubmit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast.success('Application resubmitted for review');
      onResubmit?.();
      onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resubmit');
    } finally {
      setResubmitting(false);
    }
  };

  const bodyText = (() => {
    switch (status) {
      case 'pending':
        return "Your restaurant is being reviewed. Most applications are decided within 24-48 hours.";
      case 'in_review':
        return "A reviewer has started looking at your application. We'll be in touch soon.";
      case 'docs_requested':
        return merchant.verification_notes ||
          "Our team needs more info. Please update your application.";
      case 'rejected':
        return merchant.rejection_reason ||
          "Your application was not approved. You can edit and resubmit at any time.";
      default:
        return '';
    }
  })();

  return (
    <div className={`${style.bg} ${style.border} border rounded-xl p-4 mb-6 flex items-start gap-3`}>
      <Icon className={`w-5 h-5 ${style.text} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${style.text}`}>{style.title}</p>
        <p className={`text-sm ${style.text} opacity-90 mt-1`}>{bodyText}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
        {(status === 'rejected' || status === 'docs_requested') && onEdit && (
          <button
            onClick={onEdit}
            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
        {status === 'rejected' && (
          <button
            onClick={() => void handleResubmit()}
            disabled={resubmitting}
            className="px-3 py-1.5 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-500 transition-colors flex items-center gap-1.5 disabled:opacity-60"
          >
            {resubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Resubmit
          </button>
        )}
      </div>
    </div>
  );
}
