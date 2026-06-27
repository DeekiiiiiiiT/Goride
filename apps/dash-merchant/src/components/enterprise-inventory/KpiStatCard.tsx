interface KpiStatCardProps {
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'error';
  icon?: string;
}

export default function KpiStatCard({ label, value, tone = 'default' }: KpiStatCardProps) {
  const valueClass =
    tone === 'error'
      ? 'text-error'
      : tone === 'warning'
        ? 'text-warning'
        : 'text-on-surface';

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
      <p className="text-label-sm text-on-surface-variant">{label}</p>
      <p className={`text-headline-lg font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
