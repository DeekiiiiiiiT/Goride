import React from 'react';

type MaterialIconProps = {
  name: string;
  className?: string;
  filled?: boolean;
};

export function MaterialIcon({ name, className = '', filled = false }: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0",
      }}
      aria-hidden
    >
      {name}
    </span>
  );
}
