import { titleCaseStatus } from './format';

const TONE: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-200',
  danger: 'bg-red-500/15 text-red-300',
  info: 'bg-sky-500/15 text-sky-300',
  neutral: 'bg-slate-800 text-slate-300',
};

function toneFor(value: string): keyof typeof TONE {
  const v = value.toLowerCase();
  if (v.includes('live') || ['active', 'approved', 'delivered', 'paid', 'resolved', 'won', 'online', 'on time'].includes(v)) return 'success';
  if (v.includes('ready') || v.includes('setting up') || v.includes('getting late') || ['pending', 'in_review', 'docs_requested', 'preparing', 'assigned', 'held', 'open', 'restricted', 'out of date'].includes(v)) return 'warning';
  if (v.includes('late') || v.includes('problem') || ['rejected', 'cancelled', 'canceled', 'suspended', 'failed', 'lost', 'banned'].includes(v)) return 'danger';
  if (['in_transit', 'picked_up', 'placed', 'accepted'].includes(v)) return 'info';
  if (v.includes('paused') || ['deleted', 'deactivated', 'draft'].includes(v)) return 'neutral';
  return 'neutral';
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const raw = value || 'unknown';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE[toneFor(raw)]}`}>
      {titleCaseStatus(raw)}
    </span>
  );
}
