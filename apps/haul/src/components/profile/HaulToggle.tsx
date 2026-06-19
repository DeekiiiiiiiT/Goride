import React from 'react';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
};

export function HaulToggle({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-[#ffc174]' : 'bg-[#2d3449]'}`}
    >
      <span
        className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-[#0b1326] shadow transition-transform ${checked ? 'translate-x-6' : ''}`}
      />
    </button>
  );
}
