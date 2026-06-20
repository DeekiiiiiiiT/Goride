import React from 'react';

type ToggleSwitchProps = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
};

export function ToggleSwitch({ checked, onChange, disabled = false, id, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`relative inline-flex h-6 w-12 shrink-0 rounded-full transition-colors duration-200 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-primary' : 'bg-surface-variant'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
