import { MaterialIcon } from '../signup/components/MaterialIcon';

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-outline-variant bg-surface p-12 text-center shadow-sm">
      <MaterialIcon name={icon} className="mb-4 text-outline" size={48} />
      <h3 className="mb-2 text-headline-md font-semibold text-on-surface">{title}</h3>
      {description && (
        <p className="mb-4 max-w-sm text-body-sm text-on-surface-variant">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg bg-primary-container px-inset-md py-inset-sm text-label-md font-semibold text-on-primary-container"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
