/**
 * Shared look for Dominion "Add parts" (and Vehicles), from the Stitch exports in
 * docs/stitch/dominion-add-parts-self-serve/ and docs/stitch/dominion-vehicles-catalog/ (calm modern workspace).
 * Audit rules: no capitalised eyebrow labels (G7), every action a bordered button (G5).
 */
import type { ReactNode } from "react";

export const D_TXT = "text-[#30323b] dark:text-[#e2e8f0]";
export const D_MUTED = "text-[#5d5f68] dark:text-[#94a3b8]";
export const D_CARD =
  "rounded-2xl bg-white border border-[#e6e7ee] shadow-[0_4px_16px_rgba(1,83,220,0.04)] dark:bg-[#111a2e] dark:border-[#1e293b] dark:shadow-none";
export const D_TINT = "rounded-xl bg-[#f3f4fb] dark:bg-[#0b1220]";
export const D_MONO = "font-['JetBrains_Mono',ui-monospace,monospace] tabular-nums";

export function DIcon({ name, className = "", filled }: { name: string; className?: string; filled?: boolean }) {
  const px = /text-\[(\d+)px\]/.exec(className)?.[1];
  return (
    <span
      className={`material-symbols-outlined leading-none ${className}`}
      style={{ ...(px ? { fontSize: `${px}px` } : {}), ...(filled ? { fontVariationSettings: "'FILL' 1" } : {}) }}
      aria-hidden
    >
      {name}
    </span>
  );
}

export function DIconTile({ name, tone = "blue", size = "md" }: { name: string; tone?: "blue" | "grey"; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-9 w-9 rounded-lg" : "h-12 w-12 rounded-xl";
  const icon = size === "sm" ? "text-[18px]" : "text-[24px]";
  const colour =
    tone === "blue"
      ? "bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/40 dark:text-[#93b4ff]"
      : "bg-[#eef0f6] text-[#30323b] dark:bg-[#1e293b] dark:text-[#e2e8f0]";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box} ${colour}`}>
      <DIcon name={name} className={icon} />
    </span>
  );
}

/** Numbered step strip in a card. Done = green tick, current = blue tinted block, later = grey number. */
export function DStepper({
  steps,
  current,
  onJump,
}: {
  steps: string[];
  current: number;
  onJump?: (n: number) => void;
}) {
  return (
    <nav aria-label="Steps" className={`${D_CARD} mb-6 grid grid-cols-2 gap-2 p-3 sm:grid-cols-4`}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <button
            key={label}
            type="button"
            disabled={!done || !onJump}
            onClick={() => onJump?.(n)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
              active ? "bg-[#dbe1ff] dark:bg-[#1e3a8a]/40" : done ? "hover:bg-[#f3f4fb] dark:hover:bg-[#0b1220]" : ""
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
                done
                  ? "bg-[#e6f4ea] text-[#006e31] dark:bg-[#14532d] dark:text-[#4ade80]"
                  : active
                    ? "bg-[#0153dc] text-white"
                    : "bg-[#eef0f6] text-[#5d5f68] dark:bg-[#1e293b] dark:text-[#94a3b8]"
              }`}
            >
              {done ? <DIcon name="check" className="text-[18px]" /> : n}
            </span>
            <span className={`text-[14px] font-semibold ${active ? "text-[#0153dc] dark:text-[#93b4ff]" : done ? D_TXT : D_MUTED}`}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** Question header inside a step card: blue dot, 22px question, hint, actions on the right. */
export function DQuestion({ title, hint, actions }: { title: string; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
      <div className="flex flex-col gap-1.5">
        <h2 className={`flex items-center gap-2.5 text-[22px] font-semibold tracking-tight ${D_TXT}`}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#0153dc]" />
          {title}
        </h2>
        {hint ? <div className={`text-[15px] leading-relaxed ${D_MUTED}`}>{hint}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function DCode({ children }: { children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md bg-[#eef0f6] px-2 py-0.5 text-[12px] font-medium ${D_MONO} ${D_MUTED} dark:bg-[#1e293b]`}>
      {children}
    </span>
  );
}

export function DPill({ tone, children, icon }: { tone: "green" | "amber" | "blue" | "grey" | "red"; children: ReactNode; icon?: string }) {
  const cls = {
    green: "bg-[#e6f4ea] text-[#006e31] dark:bg-[#14532d]/60 dark:text-[#4ade80]",
    amber: "bg-[#fff4dc] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]",
    blue: "bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]",
    grey: "bg-[#eef0f6] text-[#5d5f68] dark:bg-[#1e293b] dark:text-[#94a3b8]",
    red: "bg-[#fdecec] text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${cls}`}>
      {icon ? <DIcon name={icon} className="text-[14px]" /> : null}
      {children}
    </span>
  );
}

/** Bottom bar of a step: back on the left, the main action on the right. */
export function DFooter({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e7ee] pt-6 dark:border-[#1e293b]">
      <div>{left}</div>
      <div className="flex flex-wrap gap-2">{right}</div>
    </div>
  );
}

/** Source + cars strip shown above steps 3 and 4. */
export function DSourceStrip({
  source,
  cars,
  onChangeLink,
  onEditCars,
}: {
  source: string;
  cars: string[];
  onChangeLink?: () => void;
  onEditCars?: () => void;
}) {
  return (
    <div className={`${D_CARD} mb-6 flex flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`${D_TINT} inline-flex min-w-0 items-center gap-2 px-3 py-2`}>
          <DIcon name="link" className="text-[18px] text-[#0153dc]" />
          <span className={`truncate text-[14px] font-medium ${D_TXT}`}>{source}</span>
        </span>
        {onChangeLink ? (
          <button
            type="button"
            onClick={onChangeLink}
            className="parts-btn parts-btn--secondary !h-8 !px-3 text-[13px]"
          >
            Change link
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[13px] ${D_MUTED}`}>Cars:</span>
        {cars.map((c) => (
          <span
            key={c}
            className={`inline-flex items-center gap-1.5 rounded-full border border-[#e6e7ee] bg-[#f3f4fb] px-3 py-1 text-[13px] font-medium dark:border-[#1e293b] dark:bg-[#0b1220] ${D_TXT}`}
          >
            {c}
          </span>
        ))}
        {onEditCars ? (
          <button type="button" onClick={onEditCars} className="parts-btn parts-btn--secondary !h-7 !px-2.5 text-[12px]">
            <DIcon name="edit" className="text-[14px]" /> Edit cars
          </button>
        ) : null}
      </div>
    </div>
  );
}
