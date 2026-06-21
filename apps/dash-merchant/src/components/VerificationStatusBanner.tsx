import { useState } from 'react';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import type { Merchant, VerificationStatus } from '../hooks/useMerchant';

interface VerificationStatusBannerProps {
  merchant: Merchant;
  onEdit?: () => void;
  onResubmit?: () => void;
  onRefresh?: () => void;
}

type ActiveStatus = Exclude<VerificationStatus, 'approved'>;

const STATUS_CONFIG: Record<
  ActiveStatus,
  {
    container: string;
    icon: string;
    iconName: string;
    title: string;
  }
> = {
  pending: {
    container: 'border-[#FEF3C7] bg-[#FFFBEB]',
    icon: 'text-[#F59E0B]',
    iconName: 'schedule',
    title: 'Application Submitted',
  },
  in_review: {
    container: 'border-[#DBEAFE] bg-[#EFF6FF]',
    icon: 'text-[#3B82F6]',
    iconName: 'visibility',
    title: 'Application Under Review',
  },
  docs_requested: {
    container: 'border-[#FFEDD5] bg-[#FFF7ED]',
    icon: 'text-[#F97316]',
    iconName: 'assignment',
    title: 'Additional Information Needed',
  },
  rejected: {
    container: 'border-[#FFE4E6] bg-[#FFF1F2]',
    icon: 'text-[#FB7185]',
    iconName: 'cancel',
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
    return null;
  }

  const config = STATUS_CONFIG[status as ActiveStatus];

  const handleResubmit = async () => {
    setResubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
        return 'Your restaurant is being reviewed. Most applications are decided within 24–48 hours.';
      case 'in_review':
        return "A reviewer has started looking at your application. We'll be in touch soon.";
      case 'docs_requested':
        return (
          merchant.verification_notes || 'Our team needs more info. Please update your application.'
        );
      case 'rejected':
        return (
          merchant.rejection_reason ||
          'Your application was not approved. You can edit and resubmit at any time.'
        );
      default:
        return '';
    }
  })();

  const hasActions = status === 'docs_requested' || status === 'rejected';

  return (
    <div
      className={`mb-6 flex flex-col gap-3 rounded-xl border p-4 shadow-[0_4px_12px_rgba(0,0,0,0.02)] ${config.container} ${
        hasActions ? '' : 'sm:flex-row sm:items-start'
      }`}
    >
      <div className={`flex gap-3 ${hasActions ? 'w-full' : 'flex-1'}`}>
        <MaterialIcon
          name={config.iconName}
          filled
          className={`mt-0.5 shrink-0 ${config.icon}`}
          size={22}
        />
        <div className="min-w-0 flex-1">
          <h4 className="mb-1 text-base font-semibold text-on-surface">{config.title}</h4>
          <p
            className={`text-body-sm text-on-surface-variant ${
              status === 'docs_requested' ? 'mb-0 sm:mb-0' : status === 'rejected' ? 'mb-0' : ''
            }`}
          >
            {bodyText}
          </p>
        </div>
      </div>

      {status === 'docs_requested' && onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-low sm:w-auto"
        >
          <MaterialIcon name="edit" size={18} />
          Edit
        </button>
      )}

      {status === 'rejected' && (
        <div className="flex w-full flex-row gap-3 sm:pl-9">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex h-10 flex-1 items-center justify-center rounded-lg border border-[#FB7185] bg-transparent px-3 text-label-md font-semibold text-[#FB7185] transition-colors hover:bg-[#FFF1F2]"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleResubmit()}
            disabled={resubmitting}
            className="flex h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-[#FB7185] px-3 text-label-md font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resubmitting ? (
              <div className="partner-spinner !h-4 !w-4 !border-2 !border-white !border-t-transparent" />
            ) : (
              <MaterialIcon name="refresh" size={16} className="text-white" />
            )}
            Resubmit
          </button>
        </div>
      )}
    </div>
  );
}
