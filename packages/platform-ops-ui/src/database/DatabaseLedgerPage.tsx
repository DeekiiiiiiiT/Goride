import React from 'react';
import { Database, FileText, Fuel, Receipt, BookOpen } from 'lucide-react';

interface DatabaseLedgerPageProps {
  ledger: 'main' | 'trip' | 'fuel' | 'toll';
  organizationId?: string;
}

const ledgerConfig = {
  main: {
    title: 'Main Ledger',
    description: 'The canonical financial ledger across all operations — revenue, expenses, payments, and settlements.',
    icon: Database,
    color: 'indigo',
  },
  trip: {
    title: 'Trip Ledger',
    description: 'All trip records with full financial breakdown — fares, fees, tips, and net income per trip.',
    icon: FileText,
    color: 'emerald',
  },
  fuel: {
    title: 'Fuel Management Ledger',
    description: 'Fuel transactions, reimbursements, card usage, and consumption reconciliation records.',
    icon: Fuel,
    color: 'amber',
  },
  toll: {
    title: 'Toll Ledger',
    description: 'Toll transactions, tag assignments, reconciliation records, and claimable losses.',
    icon: Receipt,
    color: 'rose',
  },
};

const colorClasses: Record<string, { bg: string; border: string; iconBg: string; iconText: string; text: string }> = {
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/30',
    border: 'border-indigo-200 dark:border-indigo-800',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/50',
    iconText: 'text-indigo-600 dark:text-indigo-400',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    iconBg: 'bg-amber-100 dark:bg-amber-900/50',
    iconText: 'text-amber-600 dark:text-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    border: 'border-rose-200 dark:border-rose-800',
    iconBg: 'bg-rose-100 dark:bg-rose-900/50',
    iconText: 'text-rose-600 dark:text-rose-400',
    text: 'text-rose-700 dark:text-rose-300',
  },
};

export function DatabaseLedgerPage({ ledger, organizationId }: DatabaseLedgerPageProps) {
  const config = ledgerConfig[ledger];
  const colors = colorClasses[config.color];
  const Icon = config.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${colors.iconBg}`}>
          <Icon className={`h-6 w-6 ${colors.iconText}`} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{config.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{config.description}</p>
        </div>
      </div>

      {/* Coming Soon Card */}
      <div className={`rounded-xl border-2 border-dashed ${colors.border} ${colors.bg} p-12 flex flex-col items-center justify-center text-center`}>
        <div className={`p-4 rounded-full ${colors.iconBg} mb-4`}>
          <BookOpen className={`h-10 w-10 ${colors.iconText}`} />
        </div>
        <h2 className={`text-xl font-semibold ${colors.text} mb-2`}>Coming Soon</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
          The {config.title} view is being built. You'll be able to browse, search, and audit all {ledger === 'main' ? 'financial' : ledger} records directly from here.
        </p>
      </div>
    </div>
  );
}
