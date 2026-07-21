/**
 * Shared Expense Hub UI states + document status badge.
 * Keeps every subview's loading / empty / error / denied handling identical.
 */
import React from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';
import type { ExpenseDocumentStatus, ExpenseRuleStatus } from '../../../types/expenseHub';

export function HubLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

export function HubError({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
      {message || 'Something went wrong loading Expense Hub data.'}
      {onRetry && (
        <Button type="button" size="sm" variant="outline" className="ml-3 min-h-9" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function HubEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-300 dark:border-slate-700 px-4 py-12 text-center">
      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function HubDenied({ what = 'this section' }: { what?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 px-4 py-12 text-center">
      <ShieldAlert className="h-6 w-6 text-slate-400" />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        You don't have permission to view {what}.
      </p>
      <p className="text-xs text-slate-500">Ask a fleet owner to grant Expense Hub access.</p>
    </div>
  );
}

const DOC_STATUS_STYLES: Record<ExpenseDocumentStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  submitted: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  approved: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  posted: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  partially_paid: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  voided: 'bg-slate-200 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-500',
};

export function DocStatusBadge({ status }: { status: ExpenseDocumentStatus | string }) {
  const style = DOC_STATUS_STYLES[status as ExpenseDocumentStatus] || DOC_STATUS_STYLES.draft;
  return (
    <Badge variant="secondary" className={cn('capitalize font-normal', style)}>
      {String(status).replace('_', ' ')}
    </Badge>
  );
}

const RULE_STATUS_STYLES: Record<ExpenseRuleStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  paused: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  ended: 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
};

export function RuleStatusBadge({ status }: { status: ExpenseRuleStatus }) {
  return (
    <Badge variant="secondary" className={cn('capitalize font-normal', RULE_STATUS_STYLES[status])}>
      {status}
    </Badge>
  );
}
