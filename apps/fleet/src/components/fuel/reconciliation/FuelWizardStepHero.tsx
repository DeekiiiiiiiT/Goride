/**
 * Stitch B coach card — lightbulb + “What to do now” + body.
 */
import React, { useEffect, useRef } from 'react';
import { Lightbulb } from 'lucide-react';
import { Button } from '../../ui/button';

export type FuelWizardStepHeroProps = {
  title: string;
  body: string;
  /** Secondary / step-local action only — never duplicate footer Continue */
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  focusKey?: string;
};

export function FuelWizardStepHero({
  title,
  body,
  actionLabel,
  onAction,
  actionDisabled,
  focusKey,
}: FuelWizardStepHeroProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!focusKey) return;
    headingRef.current?.focus();
  }, [focusKey]);

  return (
    <section className="rounded-xl border border-slate-200 border-l-4 border-l-[#3525cd] bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#3525cd]">
          <Lightbulb className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-semibold text-slate-900 outline-none"
          >
            What to do now
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            <span className="sr-only">{title}. </span>
            {body}
          </p>
          {actionLabel && onAction && (
            <Button
              type="button"
              variant="link"
              className="mt-2 h-auto min-h-11 px-0 text-sm font-semibold text-[#3525cd]"
              disabled={actionDisabled}
              onClick={onAction}
            >
              {actionLabel} →
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
