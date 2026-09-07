/**
 * Shared payout status chrome — exhaustive Record so missing union members fail tsc.
 * Exported for vitest coverage of Object.keys (R4-1 / R6).
 */
import React from 'react';
import { CheckCircle, Clock, Wallet } from 'lucide-react';
import type { PayoutStatus } from '../../types/driverPayoutPeriod';

export const payoutStatusConfig: Record<
  PayoutStatus,
  { icon: React.ReactNode; color: string; bg: string; description: string }
> = {
  Finalized: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    description: 'Fuel confirmed and cash cleared — week is closed',
  },
  'Awaiting Cash': {
    icon: <Wallet className="h-4 w-4" />,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    description: 'Fuel confirmed — cash still needs to be settled',
  },
  'Awaiting Tolls': {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-orange-800',
    bg: 'bg-orange-50',
    description: 'Fuel locked — toll reconciliation still open for this week',
  },
  Pending: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    description: 'Fuel report not finalized — numbers may be estimates',
  },
};
