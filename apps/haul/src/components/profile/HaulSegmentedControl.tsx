import React from 'react';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  minWidth?: number;
};

export function HaulSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  minWidth = 64,
}: Props<T>) {
  return (
    <div className="flex rounded-lg border border-[#534434] bg-[#2d3449] p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            style={{ minWidth }}
            className={`rounded-md px-2 py-1 text-center text-sm font-medium transition-colors ${
              active
                ? 'bg-[#f59e0b] text-[#613b00] shadow-sm'
                : 'bg-transparent text-[#d8c3ad] hover:text-[#dae2fd]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
