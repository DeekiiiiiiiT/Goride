import type { ReactNode } from 'react';
import React, { useRef, useState } from 'react';

export const HAUL_MAP_BG_DELIVERING =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCghPvWROcY4jF2FQIlHTotHZ-rV8wUA9SkaoBjIRNXL9SA8dmodhMoh8lEgoSMGKENqHhJO85zjQW0xMtusqzd7V_qMczbbEVQe4ZXfqawT-YjylWcVzoM3wv0bNZ1YpDKlFrtPECgHz7yQn61xtT5JLCIOqD-RQD1mz5TNKK-aghWojMLiZflpUBeepIPqP9eXx95yD3xQqPBNvDoYcp-F3xMksHte24k3eHFgpejmPhQqXH2gxOYXQDC2zuvkUNXRojlzgWDNQ';

type Props = {
  variant?: 'grid' | 'image';
  imageUrl?: string;
  interactive?: boolean;
  children?: ReactNode;
};

export function HaulMapBackdrop({ variant = 'grid', imageUrl, interactive = false, children }: Props) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    if (!interactive) return;
    e.preventDefault();
    setScale((s) => Math.min(2.5, Math.max(1, s + (e.deltaY < 0 ? 0.1 : -0.1))));
  };

  const mapLayer =
    variant === 'image' && imageUrl ? (
      <div
        className="absolute inset-0 origin-center bg-cover bg-center opacity-70 transition-transform duration-75"
        style={{
          backgroundImage: `url('${imageUrl}')`,
          transform: interactive ? `translate(${pos.x}px, ${pos.y}px) scale(${scale})` : undefined,
        }}
      />
    ) : (
      <div
        className="absolute inset-0 origin-center transition-transform duration-75"
        style={{
          backgroundColor: '#0b1326',
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(255, 193, 116, 0.05) 0%, transparent 60%),
            linear-gradient(rgba(45, 52, 73, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(45, 52, 73, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 40px 40px, 40px 40px',
          transform: interactive ? `translate(${pos.x}px, ${pos.y}px) scale(${scale})` : undefined,
        }}
      />
    );

  return (
    <div
      className={`absolute inset-0 ${interactive ? 'touch-none' : ''}`}
      onWheel={onWheel}
      onPointerDown={(e) => {
        if (!interactive) return;
        panStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!interactive || !panStart.current) return;
        setPos({
          x: panStart.current.px + (e.clientX - panStart.current.x),
          y: panStart.current.py + (e.clientY - panStart.current.y),
        });
      }}
      onPointerUp={() => {
        panStart.current = null;
      }}
    >
      {mapLayer}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b1326] via-[#0b1326]/40 to-transparent pointer-events-none" />
      {interactive ? (
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.5, s + 0.25))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#534434] bg-[#171f33]/90 text-[#dae2fd]"
            aria-label="Zoom in"
          >
            <span className="material-symbols-outlined text-lg">add</span>
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(1, s - 0.25))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#534434] bg-[#171f33]/90 text-[#dae2fd]"
            aria-label="Zoom out"
          >
            <span className="material-symbols-outlined text-lg">remove</span>
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
