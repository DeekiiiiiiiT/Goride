/**
 * Service items (May need + Supplies) — Stitch look, ported exactly.
 * The service-items Stitch project uses the same token names as maintenanceMasterTheme.css but with
 * different values (its "secondary" is grey, ours is blue), so its colours are written here as hex.
 * Source: docs/stitch/service-items-dominion/html/<screen>/code.html tailwind config.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ItemNeed } from "./jobsApi";

/** Stitch tokens (service-items project). */
export const S = {
  primary: "#003ea9",
  primaryContainer: "#0153dc",
  secondary: "#565e74",
  secondaryContainer: "#dae2fd",
  onSurface: "#161b27",
  onSurfaceVariant: "#434655",
  outline: "#737686",
  outlineVariant: "#c3c6d7",
  lowest: "#ffffff",
  low: "#f1f3ff",
  container: "#e9edfe",
  high: "#e4e8f8",
  highest: "#dee2f3",
  error: "#ba1a1a",
  errorContainer: "#ffdad6",
  primaryFixedDim: "#b4c5ff",
} as const;

/** Stitch type scale as Tailwind classes. */
export const T = {
  labelSm: "text-[12px] leading-4 tracking-[0.01em] font-medium",
  labelMd: "text-[13px] leading-[18px] tracking-[0.005em] font-medium",
  bodySm: "text-[13px] leading-[18px] tracking-[0.005em]",
  bodyMd: "text-[15px] leading-[22px]",
  bodyLg: "text-[15px] leading-[22px] tracking-[-0.005em] font-medium",
  headlineMd: "text-[18px] leading-[26px] tracking-[-0.01em] font-semibold",
  headlineXl: "text-[28px] leading-9 tracking-[-0.02em] font-semibold",
} as const;

type Btn = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; children?: ReactNode };

/** Edit (screen 2 row action). */
export function SoftButton({ icon, children, className = "", ...rest }: Btn) {
  return (
    <button
      type="button"
      className={`flex items-center gap-1 rounded-lg bg-[#f1f3ff] px-2.5 py-1.5 ${T.labelSm} text-[#161b27] transition-colors hover:bg-[#e4e8f8] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      {icon ? <span className="material-symbols-outlined text-[15px]">{icon}</span> : null}
      {children}
    </button>
  );
}

/** Red Remove / Cancel (Stitch error-container style). */
export function RedSoftButton({ icon, children, className = "", ...rest }: Btn) {
  return (
    <button
      type="button"
      className={`flex items-center gap-1 rounded-lg bg-[#ffdad6]/50 px-2.5 py-1.5 ${T.labelSm} text-[#ba1a1a] transition-colors hover:bg-[#ffdad6] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      {icon ? <span className="material-symbols-outlined text-[15px]">{icon}</span> : null}
      {children}
    </button>
  );
}

/** Red outlined (dialog Cancel / Retire). */
export function RedOutlineButton({ icon, children, className = "", ...rest }: Btn) {
  return (
    <button
      type="button"
      className={`flex h-10 items-center gap-1.5 rounded-lg px-4 ${T.labelMd} text-[#ba1a1a] shadow-[inset_0_0_0_1px_#fca5a5] transition-colors hover:bg-[#ffdad6]/30 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      {icon ? <span className="material-symbols-outlined text-[18px]">{icon}</span> : null}
      {children}
    </button>
  );
}

/** Blue filled primary (Save, + Add, Add supply). */
export function BlueButton({ icon, iconAfter, children, className = "", ...rest }: Btn & { iconAfter?: string }) {
  return (
    <button
      type="button"
      className={`flex h-10 items-center gap-1.5 rounded-xl bg-[#0153dc] px-5 ${T.labelMd} font-semibold text-white shadow-sm transition-all hover:bg-[#003ea9] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      {icon ? <span className="material-symbols-outlined text-[18px]">{icon}</span> : null}
      {children}
      {iconAfter ? <span className="material-symbols-outlined text-[16px]">{iconAfter}</span> : null}
    </button>
  );
}

/** White outlined secondary (+ New supply, Clear query, Try again). */
export function WhiteButton({ icon, children, className = "", ...rest }: Btn) {
  return (
    <button
      type="button"
      className={`flex h-9 items-center gap-1.5 rounded-lg border border-[#c3c6d7]/80 bg-[#ffffff] px-3.5 ${T.labelMd} text-[#161b27] transition-colors hover:bg-[#f1f3ff] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      {icon ? <span className="material-symbols-outlined text-[16px] text-[#565e74]">{icon}</span> : null}
      {children}
    </button>
  );
}

export function KindPill({ kind, retired = false }: { kind: "part_type" | "supply"; retired?: boolean }) {
  if (retired) {
    return (
      <span className={`rounded-full bg-[#e9edfe] px-2 py-0.5 ${T.labelSm} text-[#737686]`}>
        {kind === "supply" ? "Supply" : "Part"}
      </span>
    );
  }
  return kind === "supply" ? (
    <span className={`rounded-full bg-[#e4e8f8] px-2 py-0.5 ${T.labelSm} text-[#434655]`}>Supply</span>
  ) : (
    <span className={`rounded-full bg-[#b4c5ff]/30 px-2 py-0.5 ${T.labelSm} text-[#003ea9]`}>Part</span>
  );
}

export function NeedPill({ need, retired = false }: { need: ItemNeed; retired?: boolean }) {
  if (retired) {
    return (
      <span className={`rounded-full bg-[#dee2f3] px-2 py-0.5 ${T.labelSm} text-[#434655]`}>
        {need === "usually" ? "Usually" : "Sometimes"}
      </span>
    );
  }
  return need === "usually" ? (
    <span className={`flex items-center gap-1 rounded-full bg-[#e8eeff] px-2 py-0.5 ${T.labelSm} font-semibold text-[#0153dc]`}>
      <span className="h-1.5 w-1.5 rounded-full bg-[#0153dc]" />
      Usually
    </span>
  ) : (
    <span className={`flex items-center gap-1 rounded-full bg-[#fffbeb] px-2 py-0.5 ${T.labelSm} font-semibold text-[#d97706]`}>
      <span className="h-1.5 w-1.5 rounded-full border border-[#d97706]" />
      Sometimes
    </span>
  );
}

/** Usually / Sometimes switch (screens 3 + 4). */
export function NeedSwitch({ value, onChange, disabled }: { value: ItemNeed; onChange: (v: ItemNeed) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex w-fit rounded-full border border-[#c3c6d7]/40 bg-[#f1f3ff] p-1" role="group" aria-label="How often is it needed?">
      {(["usually", "sometimes"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`rounded-full px-4 py-1.5 ${T.labelMd} transition-colors ${
            value === v ? "bg-[#0153dc] text-white shadow-sm" : "text-[#565e74] hover:text-[#161b27]"
          }`}
        >
          {v === "usually" ? "Usually" : "Sometimes"}
        </button>
      ))}
    </div>
  );
}

/** Material Symbols name for a JOB_ICON_KEYS key — same map the job icons use. */
export { partIconKey as supplyIcon } from "../MmChips";
