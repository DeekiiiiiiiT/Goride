import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type EmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="bg-surface rounded-xl p-10 shadow-soft text-center flex flex-col items-center">
      <div className="w-20 h-20 rounded-full bg-surface-container-low flex items-center justify-center mb-4">
        <MaterialIcon name={icon} className="text-4xl text-muted opacity-60" />
      </div>
      <h3 className="text-lg font-semibold text-on-surface mb-2">{title}</h3>
      {description && <p className="text-sm text-muted max-w-[240px] mb-6">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="bg-primary text-on-primary px-6 py-3 rounded-full text-sm font-semibold active:scale-95 transition-transform"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
