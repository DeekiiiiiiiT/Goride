import React from 'react';

type Variant = 'default' | 'industrial' | 'minimal';

type Props = {
  variant?: Variant;
};

export function HaulAtmosphericBg({ variant = 'default' }: Props) {
  return (
    <div className="haul-atmo pointer-events-none fixed inset-0 -z-10" aria-hidden>
      {variant === 'industrial' ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.08),transparent),radial-gradient(circle_at_bottom_left,rgba(0,166,224,0.05),transparent)] opacity-50" />
      ) : null}
      <div className="absolute top-[10%] left-[5%] h-64 w-64 rounded-full bg-[#f59e0b]/5 blur-[100px]" />
      <div className="absolute bottom-[20%] right-[10%] h-96 w-96 rounded-full bg-[#7bd0ff]/5 blur-[120px]" />
      {variant === 'minimal' ? (
        <>
          <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-[#f59e0b] opacity-20 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-[#00a6e0] opacity-10 blur-[120px]" />
        </>
      ) : null}
    </div>
  );
}
