import type { DocRoleStatus } from './docRoles';

const COPY: Record<DocRoleStatus, string> = {
  ok: 'On file',
  optional_missing: 'Optional',
  blocking: 'Needed for seal',
  soft_hold: 'Soft hold',
};

const TONE: Record<DocRoleStatus, string> = {
  ok: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  optional_missing: 'bg-slate-100 text-slate-600 ring-slate-200',
  blocking: 'bg-amber-50 text-amber-950 ring-amber-200',
  soft_hold: 'bg-amber-50/70 text-amber-900 ring-amber-100',
};

export function DocRoleBadge({ status }: { status: DocRoleStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${TONE[status]}`}
    >
      {COPY[status]}
    </span>
  );
}
