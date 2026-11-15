/**
 * Week Reconciliation step 5 Fuel — one part at a time (owner, 15 Nov 2026; Stitch
 * "Fuel step redesign" screens 1–8). Replaces the five stacked sections: a progress row
 * of five parts, one card on screen, Back / Next slide between them. Next always works;
 * only Finalize fuel waits until every part is clear. Layout only — each part's content
 * comes from the fuel wizard.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { cn } from '../../ui/utils';

export type FuelSlideTone = 'fix' | 'review' | 'done' | 'info' | 'locked';

export type FuelSlidePart = {
  id: 'checks' | 'disputes' | 'policy' | 'distance' | 'finalize';
  /** Card title, e.g. "Fuel checks". */
  title: string;
  /** Short name in the progress row, e.g. "Policy". */
  short: string;
  description: string;
  status: { text: string; tone: FuelSlideTone };
  testId: string;
  /** The part's content; a function gets `goTo(partId)` (used by the Finalize card's "Go to" buttons). */
  content: React.ReactNode | ((api: { goTo: (id: FuelSlidePart['id']) => void }) => React.ReactNode);
};

const CHIP: Record<FuelSlideTone, string> = {
  fix: 'bg-[#fff1f2] text-[#ba1a1a]',
  review: 'bg-[#fffbeb] text-[#b45309]',
  done: 'bg-[#ecfdf5] text-[#069669]',
  info: 'bg-[#f1f5f9] text-[#475569]',
  locked: 'bg-[#f1f5f9] text-[#64748b]',
};

/** Where the step opens: the first part that still needs something, else the last part. */
export function firstOpenPartIndex(parts: Pick<FuelSlidePart, 'status'>[]): number {
  const i = parts.findIndex((p) => p.status.tone === 'fix' || p.status.tone === 'review');
  return i >= 0 ? i : Math.max(0, parts.length - 1);
}

/** Parts before the last one that still need something (the Finalize card lists them). */
export function openParts<T extends Pick<FuelSlidePart, 'status'>>(parts: T[]): T[] {
  return parts.slice(0, -1).filter((p) => p.status.tone === 'fix' || p.status.tone === 'review');
}

function StatusChip({ status, onDark = false }: { status: FuelSlidePart['status']; onDark?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        onDark && status.tone === 'fix' ? 'bg-[#ba1a1a] text-white' : CHIP[status.tone],
      )}
    >
      {status.tone === 'done' ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : null}
      {status.tone === 'locked' ? <Lock className="h-3 w-3" aria-hidden /> : null}
      {status.tone === 'fix' && !onDark ? <span className="h-1.5 w-1.5 rounded-full bg-[#ba1a1a]" aria-hidden /> : null}
      {status.text}
    </span>
  );
}

export function FuelDeskSlides({ parts }: { parts: FuelSlidePart[] }) {
  const startAt = useMemo(() => firstOpenPartIndex(parts), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = useState(startAt);
  const [direction, setDirection] = useState<'next' | 'back'>('next');
  const current = parts[Math.min(index, parts.length - 1)];
  const last = index >= parts.length - 1;

  const go = (to: number) => {
    if (to < 0 || to >= parts.length || to === index) return;
    setDirection(to > index ? 'next' : 'back');
    setIndex(to);
  };

  // Left / right arrow keys move Back / Next when no text box has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-4" data-testid="recon-fuel-slides">
      {/* Progress row: five parts, each a button. */}
      <div>
        <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="Fuel parts">
          {parts.map((p, i) => {
            const active = i === index;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => go(i)}
                data-testid={`recon-fuel-part-${p.id}`}
                className={cn(
                  'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center transition-colors',
                  active ? 'bg-[#030213] text-white shadow-sm' : 'bg-[#eff4ff] text-[#0b1c30] hover:bg-[#dce9ff]',
                )}
              >
                <span className="flex items-center gap-1 text-[13px] font-semibold">
                  {p.status.tone === 'locked' && !active ? <Lock className="h-3 w-3" aria-hidden /> : null}
                  {i + 1} {p.short}
                </span>
                <StatusChip status={p.status} onDark={active} />
              </button>
            );
          })}
        </div>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#e5eeff]" aria-hidden>
          <div
            className="h-full rounded-full bg-[#030213] transition-all duration-300"
            style={{ width: `${((index + 1) / parts.length) * 100}%` }}
          />
        </div>
      </div>

      {/* One part at a time. */}
      <section
        key={current.id}
        className={cn(
          'rounded-[20px] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] animate-in fade-in duration-300',
          direction === 'next' ? 'slide-in-from-right-8' : 'slide-in-from-left-8',
        )}
        data-testid={current.testId}
        aria-label={current.title}
      >
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[22px] font-semibold tracking-tight text-[#0b1c30]">{current.title}</h3>
            <p className="text-[15px] text-[#47464c]">{current.description}</p>
          </div>
          <StatusChip status={current.status} />
        </header>

        <div>
          {typeof current.content === 'function'
            ? current.content({ goTo: (id) => go(parts.findIndex((p) => p.id === id)) })
            : current.content}
        </div>

        <footer className="mt-6 flex items-center justify-between gap-3 border-t border-[#eff4ff] pt-5">
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            data-testid="recon-fuel-back"
            className="flex h-11 items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {index > 0 ? parts[index - 1].title : 'Back'}
          </button>
          <span className="text-sm text-[#47464c]">
            Part {index + 1} of {parts.length}
          </span>
          {last ? (
            <span className="w-[120px]" aria-hidden />
          ) : (
            <button
              type="button"
              onClick={() => go(index + 1)}
              data-testid="recon-fuel-next"
              className="flex h-11 items-center gap-2 rounded-xl bg-[#030213] px-5 text-sm font-semibold text-white hover:bg-[#213145]"
            >
              Next: {parts[index + 1].title}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

/** Finalize card: what is still open, each with a jump button (Stitch screen 5). */
export function FuelStillOpenList({
  items,
  onGo,
}: {
  items: Array<{ id: FuelSlidePart['id']; title: string; status: FuelSlidePart['status'] }>;
  onGo: (id: FuelSlidePart['id']) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5 space-y-2" data-testid="recon-fuel-still-open">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#47464c]">
        Still open ({items.length})
      </p>
      {items.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#eff4ff] px-4 py-3">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-[#0b1c30]">
            <span
              className={cn('h-2 w-2 rounded-full', p.status.tone === 'fix' ? 'bg-[#ba1a1a]' : 'bg-[#f59e0b]')}
              aria-hidden
            />
            {p.title}: {p.status.text.toLowerCase()}
          </p>
          <button
            type="button"
            onClick={() => onGo(p.id)}
            className="h-10 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#f8f9ff]"
          >
            Go to {p.title}
          </button>
        </div>
      ))}
    </div>
  );
}
