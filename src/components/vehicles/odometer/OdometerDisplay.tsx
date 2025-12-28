import React from 'react';

interface OdometerDisplayProps {
  value: number;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function OdometerDisplay({ value, unit = 'km', size = 'md', className = '' }: OdometerDisplayProps) {
  // Format to 6 digits, padding with zeros
  const formattedValue = Math.round(value).toString().padStart(6, '0');
  const digits = formattedValue.split('');

  // Size configurations
  const sizes = {
    sm: {
      digit: 'w-5 h-7 text-base',
      gap: 'gap-[1px]',
      padding: 'p-[1px]',
      unit: 'text-xs'
    },
    md: {
      digit: 'w-6 h-9 text-lg',
      gap: 'gap-[2px]',
      padding: 'p-[2px]',
      unit: 'text-sm'
    },
    lg: {
      digit: 'w-8 h-12 text-2xl',
      gap: 'gap-[3px]',
      padding: 'p-[3px]',
      unit: 'text-base'
    }
  };

  const currentSize = sizes[size];

  return (
    <div className={`flex items-end gap-2 ${className}`}>
        <div className={`flex ${currentSize.gap} bg-slate-900 ${currentSize.padding} rounded-md border-2 border-slate-700 shadow-inner`}>
            {digits.map((digit, index) => (
                <div 
                    key={index} 
                    className={`${currentSize.digit} flex items-center justify-center bg-zinc-800 text-white font-mono font-bold leading-none border-r border-slate-900/50 last:border-r-0 relative overflow-hidden rounded-[1px]`}
                >
                    <span className="z-10 relative drop-shadow-md">{digit}</span>
                    
                    {/* Inner Shadow / Depth */}
                    <div className="absolute inset-0 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] pointer-events-none" />
                    
                    {/* Glossy overlay effect (Top half) */}
                    <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                    
                    {/* Highlight line */}
                    <div className="absolute inset-x-0 top-0 h-[1px] bg-white/20 pointer-events-none" />
                </div>
            ))}
        </div>
        <span className={`text-slate-500 font-medium mb-1 ${currentSize.unit}`}>{unit}</span>
    </div>
  );
}
