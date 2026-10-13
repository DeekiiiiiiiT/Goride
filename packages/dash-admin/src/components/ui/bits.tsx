import React from 'react';
import { Link } from 'react-router-dom';

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-12 text-center">
      <p className="text-slate-100 font-medium">{title}</p>
      {body && <p className="text-sm text-slate-400 mt-1">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  href,
}: {
  label: string;
  value: string;
  delta?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 h-full">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-2xl font-semibold text-slate-100 mt-1">{value}</p>
      {delta && <p className="text-xs text-slate-500 mt-1">{delta}</p>}
    </div>
  );
  return href ? <Link to={href} className="block hover:border-amber-500/40">{inner}</Link> : inner;
}

export function PolicyChips({ chips }: { chips: Array<{ label: string; hint?: string }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span key={chip.label} title={chip.hint} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
          {chip.label}
        </span>
      ))}
    </div>
  );
}

export function EntityDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <aside className="relative w-full max-w-md h-full bg-slate-950 border-l border-slate-800 p-5 overflow-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-white">Close</button>
        </div>
        {children}
      </aside>
    </div>
  );
}
