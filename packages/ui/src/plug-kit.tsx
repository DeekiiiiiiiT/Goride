import type { ReactNode } from 'react';

const tap = 'inline-flex min-h-12 min-w-12 items-center justify-center';

export function PriceBubblePin({
  price,
  cheapest = false,
  label = 'Price',
}: {
  price: string;
  cheapest?: boolean;
  label?: string;
}) {
  return (
    <span
      className={`${tap} gap-1 rounded-full px-3 text-sm font-bold text-white tabular-nums ${cheapest ? 'bg-tertiary text-on-surface' : 'bg-primary'}`}
      aria-label={label}
    >
      <span className="size-2 rounded-full bg-white" aria-hidden />
      {price}
    </span>
  );
}

const GRADES = {
  e10_87: { name: 'E-10 87', className: 'bg-grade-87 text-white' },
  e10_90: { name: 'E-10 90', className: 'bg-grade-90 text-white' },
  diesel: { name: 'Diesel', className: 'bg-grade-diesel text-white' },
} as const;

export type FuelGrade = keyof typeof GRADES;

export function FuelGradeChip({ grade, price }: { grade: FuelGrade; price?: string }) {
  const g = GRADES[grade];
  return (
    <span className={`${tap} gap-2 rounded-lg px-3 text-xs font-bold ${g.className}`}>
      {g.name}
      {price ? <span className="tabular-nums font-semibold">{price}</span> : null}
    </span>
  );
}

const PILL = {
  overdue: 'bg-error text-white',
  due_soon: 'bg-warning text-white',
  upcoming: 'bg-surface text-on-surface ring-1 ring-line',
  done: 'bg-success text-white',
} as const;

export function MaintenanceStatusPill({
  status,
  label,
}: {
  status: keyof typeof PILL;
  label: string;
}) {
  return <span className={`${tap} rounded-full px-3 text-xs font-bold ${PILL[status]}`}>{label}</span>;
}

export function GpsAccuracyIndicator({ meters }: { meters: number | null }) {
  const band = meters == null ? 'unknown' : meters <= 20 ? 'good' : meters <= 50 ? 'ok' : 'poor';
  const color = band === 'good' ? 'bg-success' : band === 'ok' ? 'bg-warning' : band === 'poor' ? 'bg-error' : 'bg-neutral';
  const text = meters == null ? 'No GPS fix' : `${Math.round(meters)} m accuracy`;
  return (
    <span className={`${tap} gap-2 rounded-full bg-surface px-3 text-sm text-on-surface ring-1 ring-line`}>
      <span className={`size-3 rounded-full ${color}`} aria-hidden />
      {text}
    </span>
  );
}

const TIERS = ['Direct OEM', 'Sister vehicle', 'Engine compatible', 'Aftermarket', 'Universal'] as const;

export function PartsTierHeader({ tier }: { tier: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <h2 className="text-sm font-bold uppercase tracking-wide text-primary">
      Tier {tier} · {TIERS[tier - 1]}
    </h2>
  );
}

export function PendingDashedPin({ label = 'Awaiting approval' }: { label?: string }) {
  return (
    <span className={`${tap} gap-2 rounded-full border-2 border-dashed border-pending px-3 text-sm font-semibold text-pending`}>
      <span className="size-2 rounded-full border border-dashed border-pending" aria-hidden />
      {label}
    </span>
  );
}

export function PlugStatus({
  kind,
  children,
}: {
  kind: 'loading' | 'empty' | 'error';
  children: ReactNode;
}) {
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className="rounded-lg bg-surface p-4 text-sm text-on-surface ring-1 ring-line">
      {children}
    </div>
  );
}
