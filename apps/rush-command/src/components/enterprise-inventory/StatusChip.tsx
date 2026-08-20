interface StatusChipProps {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
}

const TONE_CLASS: Record<NonNullable<StatusChipProps['tone']>, string> = {
  neutral: 'bg-surface-container-high text-on-surface-variant',
  success: 'bg-green-100 text-green-900',
  warning: 'bg-amber-100 text-amber-900',
  error: 'bg-error-container text-error',
  info: 'bg-primary-container/15 text-on-primary-container',
};

export default function StatusChip({ label, tone = 'neutral' }: StatusChipProps) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-label-sm font-semibold capitalize ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}
