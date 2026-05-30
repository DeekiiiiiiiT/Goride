import React, { useEffect, useRef, useState } from 'react';

const CX = 140;
const CY = 128;
const R = 96;
const MIN_ANGLE = 0;
const MAX_ANGLE = Math.PI;

type Props = {
  online: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function angleFromProgress(progress: number): number {
  return MAX_ANGLE * (1 - clamp01(progress));
}

function progressFromAngle(angle: number): number {
  return clamp01(1 - angle / MAX_ANGLE);
}

function pointOnArc(angle: number): { x: number; y: number } {
  return {
    x: CX + R * Math.cos(angle),
    y: CY - R * Math.sin(angle),
  };
}

function describeArc(startAngle: number, endAngle: number): string {
  const start = pointOnArc(startAngle);
  const end = pointOnArc(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function OnlineGaugeSlider({ online, onToggle, disabled = false, className = '' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const [progress, setProgress] = useState(online ? 1 : 0);
  useEffect(() => {
    if (!draggingRef.current) setProgress(online ? 1 : 0);
  }, [online]);

  const angle = angleFromProgress(progress);
  const thumb = pointOnArc(angle);
  const activeArc = describeArc(MAX_ANGLE, angle);

  const setFromClient = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left - CX;
    const y = CY - (clientY - rect.top);
    let a = Math.atan2(y, x);
    if (a < 0) a = 0;
    if (a > MAX_ANGLE) a = MAX_ANGLE;
    setProgress(progressFromAngle(a));
  };

  const commit = () => {
    draggingRef.current = false;
    const shouldBeOnline = progress >= 0.55;
    if (shouldBeOnline !== online) {
      onToggle();
      return;
    }
    setProgress(online ? 1 : 0);
  };

  const goOnlineDisabled = disabled && !online;
  const label = online ? 'Slide left to go offline' : 'Slide right to go online';

  return (
    <div
      className={`pointer-events-none ${className}`}
      aria-hidden={false}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-lg safe-x px-4">
        <div
          className={`rounded-t-3xl border border-b-0 border-slate-200/90 bg-white/95 px-3 pt-2 pb-1 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95 dark:shadow-[0_-8px_30px_rgba(0,0,0,0.35)] ${
            goOnlineDisabled ? 'opacity-60' : ''
          }`}
        >
          <p className="text-center text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
            {label}
          </p>
          <svg
            ref={svgRef}
            viewBox="0 0 280 140"
            className={`mx-auto block w-full max-w-[280px] touch-none select-none ${
              goOnlineDisabled ? 'pointer-events-none' : 'cursor-pointer'
            }`}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={online ? 'Online — slide to go offline' : 'Offline — slide to go online'}
            onPointerDown={(e) => {
              if (goOnlineDisabled) return;
              draggingRef.current = true;
              svgRef.current?.setPointerCapture(e.pointerId);
              setFromClient(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (!draggingRef.current || goOnlineDisabled) return;
              setFromClient(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              if (!draggingRef.current) return;
              try {
                svgRef.current?.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
              commit();
            }}
            onPointerCancel={(e) => {
              if (!draggingRef.current) return;
              try {
                svgRef.current?.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
              commit();
            }}
          >
            <path
              d={describeArc(MAX_ANGLE, MIN_ANGLE)}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              className="text-slate-200 dark:text-slate-700"
            />
            <path
              d={activeArc}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              className={online || progress > 0.08 ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}
            />
            <circle
              cx={thumb.x}
              cy={thumb.y}
              r={18}
              className="fill-white stroke-emerald-600 shadow-sm dark:fill-slate-900 dark:stroke-emerald-400"
              strokeWidth="3"
            />
            <circle
              cx={thumb.x}
              cy={thumb.y}
              r={6}
              className={online || progress > 0.5 ? 'fill-emerald-500' : 'fill-slate-400'}
            />
            <text x={36} y={132} className="fill-slate-400 text-[10px] font-semibold">
              Offline
            </text>
            <text x={218} y={132} className="fill-slate-400 text-[10px] font-semibold">
              Online
            </text>
          </svg>
          <p
            className={`text-center text-xs font-semibold -mt-1 pb-1 ${
              online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {online ? 'You are online' : 'You are offline'}
          </p>
        </div>
      </div>
    </div>
  );
}
