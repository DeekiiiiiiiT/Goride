/** Console amber tokens for In-House desk (aligned with Finance/Support/etc.). */

export const IH = {
  page: 'bg-[#0f172a] text-[#cbd5e1]',
  surface: 'rounded-lg border border-slate-700/80 bg-[#1e293b]',
  surfaceSoft: 'rounded-lg border border-slate-700/60 bg-[#1e293b]/60',
  text: 'text-[#cbd5e1]',
  muted: 'text-slate-400',
  primaryBtn:
    'rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40',
  primaryBtnLg:
    'rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40',
  secondaryBtn: 'rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700',
  chip: 'rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-300',
  chipActive: 'rounded-lg bg-amber-500/15 px-3 py-1 text-sm font-medium text-amber-300 ring-1 ring-amber-500/40',
  input: 'rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500',
  link: 'text-amber-400 hover:text-amber-300',
  ok: 'text-[#22c55e]',
  warn: 'text-[#f59e0b]',
  err: 'text-[#ef4444]',
  deskOpen: 'rounded-full bg-emerald-950/80 px-3 py-1 text-sm text-emerald-100 ring-1 ring-emerald-500/40',
  deskClosed: 'rounded-full bg-red-950/80 px-3 py-1 text-sm text-red-100 ring-1 ring-red-500/40',
  needsYou: 'rounded-lg border border-amber-500/40 bg-amber-950/30 p-3',
  banner: 'rounded-lg border border-amber-500/40 bg-[#1e293b] px-3 py-2 text-sm text-[#cbd5e1]',
} as const;

export function timerBadgeClass(tone: 'ok' | 'warn' | 'late') {
  if (tone === 'late') return 'rounded-full bg-red-950 px-2 py-0.5 text-xs font-medium text-red-200';
  if (tone === 'warn') return 'rounded-full bg-amber-950 px-2 py-0.5 text-xs font-medium text-amber-200';
  return 'rounded-full bg-emerald-950 px-2 py-0.5 text-xs font-medium text-emerald-200';
}
