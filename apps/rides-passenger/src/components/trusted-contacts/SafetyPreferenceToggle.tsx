import React from 'react';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  SURFACE_CONTAINER_HIGHEST,
} from '@/lib/passengerTheme';

type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  disabled?: boolean;
};

export function SafetyPreferenceToggle({
  checked,
  onChange,
  icon,
  iconBg,
  iconColor,
  title,
  description,
  disabled = false,
}: Props) {
  return (
    <div
      className="flex items-center justify-between p-5 transition-colors"
      style={{ backgroundColor: checked ? 'rgba(0, 74, 198, 0.03)' : 'transparent', opacity: disabled ? 0.6 : 1 }}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-semibold" style={{ color: ON_SURFACE }}>
            {title}
          </p>
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {description}
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed"
        style={{
          backgroundColor: checked ? PRIMARY : SURFACE_CONTAINER_HIGHEST,
        }}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
          style={{ left: checked ? 'calc(100% - 1.25rem - 4px)' : '4px' }}
        />
      </button>
    </div>
  );
}
