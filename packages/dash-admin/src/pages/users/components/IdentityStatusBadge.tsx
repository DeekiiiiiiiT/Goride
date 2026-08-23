import React from 'react';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  restricted: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  suspended: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  banned: 'bg-red-500/20 text-red-300 border-red-500/40',
  deleted: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
  pending: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  deactivated: 'bg-slate-600/20 text-slate-400 border-slate-500/40',
};

export function IdentityStatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const key = (status || 'active').toLowerCase();
  const style = STATUS_STYLES[key] ?? 'bg-slate-700/50 text-slate-300 border-slate-600';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${style} ${className}`}
    >
      {status || 'active'}
    </span>
  );
}

export function PersonaChip({ persona }: { persona: string }) {
  const labels: Record<string, string> = {
    customer: 'Customer',
    courier: 'Courier',
    merchant_owner: 'Merchant owner',
    merchant_staff: 'Staff',
  };
  return (
    <span className="inline-flex px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700">
      {labels[persona] ?? persona}
    </span>
  );
}
