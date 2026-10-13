import type { MerchantVerificationStatus } from '@roam/dash-admin-client';
import { StatusBadge } from './ui/StatusBadge';

export function MerchantStatusBadge({ status }: { status: MerchantVerificationStatus; className?: string }) {
  return <StatusBadge value={status} />;
}
