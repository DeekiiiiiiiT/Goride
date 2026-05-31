import React from 'react';
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Phone,
  Shield,
  Upload,
} from 'lucide-react';
import { cn } from '@roam/ui';

const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:border-slate-700 dark:bg-slate-900';

export function InsuranceCenter() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Insurance</h1>

      <div
        className={cn(
          cardClass,
          'border-sky-200 bg-gradient-to-br from-sky-50 to-cyan-50 p-5 dark:from-sky-950/40 dark:to-cyan-950/30',
        )}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/60">
            <Shield className="h-6 w-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 dark:text-white">Insurance Status</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">No policy on file</p>
          </div>
          <AlertCircle className="h-6 w-6 shrink-0 text-amber-500" />
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white py-2.5 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-50 dark:border-sky-800 dark:bg-slate-900 dark:text-sky-400 dark:hover:bg-slate-800"
        >
          <Upload className="h-4 w-4" />
          Upload Policy
        </button>
      </div>

      <section>
        <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Rideshare Coverage
        </h2>
        <div className={cn(cardClass, 'divide-y divide-slate-100 overflow-hidden dark:divide-slate-800')}>
          <CoverageItem platform="Uber" description="Add Uber rideshare endorsement" status="unknown" />
          <CoverageItem platform="Lyft" description="Add Lyft rideshare endorsement" status="unknown" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Required Documents
        </h2>
        <div className={cn(cardClass, 'divide-y divide-slate-100 overflow-hidden dark:divide-slate-800')}>
          <DocumentItem label="Insurance Card" status="missing" />
          <DocumentItem label="Policy Declaration" status="missing" />
          <DocumentItem label="Rideshare Endorsement" status="missing" />
        </div>
      </section>

      <div className={cn(cardClass, 'p-4')}>
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">Minimum Requirements</h3>
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Liability: $50,000/$100,000/$25,000
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Comprehensive &amp; Collision recommended
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Rideshare endorsement required
          </li>
        </ul>
      </div>

      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition-colors hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
      >
        <Phone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">Get Insurance Quote</p>
          <p className="text-sm text-emerald-800/80 dark:text-emerald-400/80">Compare rideshare-friendly options</p>
        </div>
        <ChevronRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
      </button>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Insurance Requirement</p>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
              All rideshare platforms require proof of insurance with rideshare endorsement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoverageItem({
  platform,
  description,
  status,
}: {
  platform: string;
  description: string;
  status: 'covered' | 'not_covered' | 'unknown';
}) {
  const Icon =
    status === 'covered' ? CheckCircle : AlertCircle;
  const color =
    status === 'covered'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'not_covered'
        ? 'text-red-500'
        : 'text-amber-500';

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className={cn('h-5 w-5 shrink-0', color)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{platform}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}

function DocumentItem({ label, status }: { label: string; status: 'uploaded' | 'missing' | 'expired' }) {
  const config = {
    uploaded: { label: 'Uploaded', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400' },
    missing: { label: 'Missing', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400' },
    expired: { label: 'Expired', className: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-400' },
  }[status];

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-slate-900 dark:text-white">{label}</span>
      <span className={cn('rounded-full px-2 py-1 text-xs font-semibold', config.className)}>
        {config.label}
      </span>
    </div>
  );
}
