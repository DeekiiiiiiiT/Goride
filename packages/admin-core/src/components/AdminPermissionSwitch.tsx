import React from 'react';

type Props = {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (value: boolean) => void;
  'aria-label'?: string;
  title?: string;
};

/** Horizontal slide toggle — styles in admin-portal.css (no Tailwind scan required). */
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
      data-state={checked ? 'checked' : 'unchecked'}
      className="admin-perm-switch"
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
    >
      <span className="admin-perm-switch__thumb" aria-hidden />
    </button>
  );
}
