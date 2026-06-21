import type { DeclineReasonId } from '@/lib/declineReasons';
import { appendDeclineReason, loadDeclineReasons } from '@/lib/courierStorage';

export function persistDeclineReason(payload: {
  reasonId: DeclineReasonId;
  offerId?: string;
}): void {
  appendDeclineReason(payload);
}

export { loadDeclineReasons };
