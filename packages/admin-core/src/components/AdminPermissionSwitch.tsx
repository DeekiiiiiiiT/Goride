import React from 'react';
import { clsx } from 'clsx';

type Props = {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (value: boolean) => void;
  'aria-label'?: string;
  title?: string;
};

/** Visible on dark admin portals without @roam/ui theme tokens. */
export function AdminPermissionSwitch({
  checked,
  disabled,
  onCheckedChange,
  'aria-label': ariaLabel,
  title,
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
        checked ? 'border-emerald-500/60 bg-emerald-600' : 'border-slate-600 bg-slate-800',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'pointer-events-none block size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[1.35rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
