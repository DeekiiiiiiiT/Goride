import React from 'react';

type Props = {
  show: boolean;
  className?: string;
};

/** Small red dot for unread trip chat — place inside a `relative` wrapper around the icon. */
export function RideChatUnreadDot({ show, className = '' }: Props) {
  if (!show) return null;
  return (
    <span
      className={`pointer-events-none absolute z-10 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900 ${className}`}
      aria-hidden
    />
  );
}
