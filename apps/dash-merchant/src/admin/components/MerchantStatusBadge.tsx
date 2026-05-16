import React from 'react';
import { Clock, Eye, FileQuestion, CheckCircle2, XCircle } from 'lucide-react';
import type { MerchantVerificationStatus } from '../services/dashAdminService';

interface MerchantStatusBadgeProps {
  status: MerchantVerificationStatus;
  className?: string;
}

const STATUS_META: Record<
  MerchantVerificationStatus,
  { label: string; classes: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: 'Pending',
    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    Icon: Clock,
  },
  in_review: {
    label: 'In Review',
    classes: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    Icon: Eye,
  },
  docs_requested: {
    label: 'Docs Requested',
    classes: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    Icon: FileQuestion,
  },
  approved: {
    label: 'Approved',
    classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    Icon: CheckCircle2,
  },
  rejected: {
    label: 'Rejected',
    classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    Icon: XCircle,
  },
};

export function MerchantStatusBadge({ status, className = '' }: MerchantStatusBadgeProps) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.classes} ${className}`}
    >
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}
