import React from 'react';

type BusyZoneShaderProps = {
  className?: string;
  label?: string;
};

/** Heat-map busy zone overlay using the burgundy shader texture. */
export function BusyZoneShader({ className = '', label = 'Busy' }: BusyZoneShaderProps) {
  return (
    <div className={`absolute pointer-events-none ${className}`}>
      <div
        className="w-28 h-28 courier-busy-zone"
        style={{ backgroundImage: "url('/images/shaders/busy-zone.png')" }}
        aria-hidden
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface text-on-surface rounded-full shadow-md px-2 py-1 flex items-center gap-1 text-[10px] font-bold border border-tertiary-container whitespace-nowrap">
        <span className="w-2 h-2 rounded-full bg-tertiary shrink-0" />
        {label}
      </div>
    </div>
  );
}
