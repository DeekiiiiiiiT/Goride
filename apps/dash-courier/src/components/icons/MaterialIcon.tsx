import React from 'react';

type MaterialIconProps = {
  name: string;
  className?: string;
  filled?: boolean;
  size?: number | string;
};

export function MaterialIcon({ name, className = '', filled = false, size }: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0",
        ...(size != null ? { fontSize: typeof size === 'number' ? `${size}px` : size } : {}),
      }}
      aria-hidden
    >
      {name}
    </span>
  );
}
