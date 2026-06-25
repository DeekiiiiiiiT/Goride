import { formatTimeAgo } from '../../../lib/partner-utils';

interface HandledByLabelProps {
  name?: string | null;
  at?: string | null;
  action?: string | null;
}

export default function HandledByLabel({ name, at, action }: HandledByLabelProps) {
  if (!name) return null;

  const actionLabel =
    action === 'accepted'
      ? 'Accepted by'
      : action === 'ready'
        ? 'Marked ready by'
        : action === 'preparing'
          ? 'Started by'
          : 'Handled by';

  return (
    <p className="text-label-sm text-on-surface-variant">
      {actionLabel} <span className="font-semibold text-on-surface">{name}</span>
      {at ? ` · ${formatTimeAgo(at)}` : ''}
    </p>
  );
}
