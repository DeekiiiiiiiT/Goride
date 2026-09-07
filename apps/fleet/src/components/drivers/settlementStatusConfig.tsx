/**
 * Shared settlement status chrome — exhaustive Record so missing union members fail tsc.
 * Exported for vitest coverage of Object.keys (R4-1 / R6).
 */
import React from 'react';
import {
  CheckCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  MinusCircle,
} from 'lucide-react';
import type { SettlementStatus } from './SettlementSummaryView';

export const settlementStatusConfig: Record<
  SettlementStatus,
  { icon: React.ReactNode; color: string; bg: string; label: string }
> = {
  Settled: {
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    label: 'Settled',
  },
  'Company Owes': {
    icon: <ArrowUpCircle className="h-4 w-4" />,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    label: 'Company Owes Driver',
  },
  'Driver Owes': {
    icon: <ArrowDownCircle className="h-4 w-4" />,
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    label: 'Driver Owes Company',
  },
  'Awaiting Tolls': {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-orange-800',
    bg: 'bg-orange-50',
    label: 'Awaiting Tolls',
  },
  Pending: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    label: 'Pending — Not Yet Finalized',
  },
  'No Activity': {
    icon: <MinusCircle className="h-4 w-4" />,
    color: 'text-slate-500',
    bg: 'bg-slate-100',
    label: 'No Activity',
  },
};
