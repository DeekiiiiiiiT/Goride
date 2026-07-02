import { Clock, ShieldAlert, Timer } from 'lucide-react';
import { Badge, cn } from '@roam/ui';
import type { EvidenceMediaState } from './types';
import { daysUntilDelete } from './evidenceState';

interface EvidenceExpiryBadgeProps {
  state: EvidenceMediaState;
  deleteAfter?: string | null;
  className?: string;
}

export function EvidenceExpiryBadge({
  state,
  deleteAfter,
  className,
}: EvidenceExpiryBadgeProps) {
  if (state === 'unavailable' || state === 'available') return null;

  const daysLeft = daysUntilDelete(deleteAfter);

  if (state === 'expired') {
    return (
      <Badge
        variant="outline"
        className={cn('border-slate-300 bg-slate-50 text-slate-600', className)}
      >
        <Clock className="h-3 w-3" />
        Evidence expired
      </Badge>
    );
  }

  if (state === 'pending_review') {
    return (
      <Badge
        variant="outline"
        className={cn('border-amber-300 bg-amber-50 text-amber-800', className)}
      >
        <ShieldAlert className="h-3 w-3" />
        Held until review
      </Badge>
    );
  }

  if (state === 'expiring_soon' && daysLeft != null) {
    return (
      <Badge
        variant="outline"
        className={cn('border-orange-300 bg-orange-50 text-orange-800', className)}
      >
        <Timer className="h-3 w-3" />
        Expires in {daysLeft}d
      </Badge>
    );
  }

  return null;
}
