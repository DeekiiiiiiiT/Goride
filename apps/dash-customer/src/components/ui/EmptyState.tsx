import { MaterialIcon } from '@/components/icons/MaterialIcon';

type Props = {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  icon = 'search_off',
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
      <div className="w-24 h-24 mb-4 rounded-full bg-surface-container-high flex items-center justify-center">
        <MaterialIcon name={icon} className="text-4xl text-outline-variant" />
      </div>
      <h3 className="text-headline-sm font-semibold text-on-surface mb-2">{title}</h3>
      {description && <p className="text-body-md text-on-surface-variant max-w-xs mb-6">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="bg-primary-container text-on-primary text-label-md font-semibold tracking-wide px-6 py-3 rounded-lg active:scale-95 transition-transform"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
