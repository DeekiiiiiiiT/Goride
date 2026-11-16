/**
 * Look kit for the powertrain job fit screens, taken from the Stitch exports in
 * docs/stitch/powertrain-job-fit-dominion/html/ (01–10): their Tailwind theme colours, type scale and
 * card / chip / button shapes, each with a dark-mode pair. Only the look lives here; names and rules
 * stay in powertrainModel.ts.
 */
import type { ReactNode } from "react";
import { DIcon } from "../parts-database/add-parts/catalog/dominionKit";

/* Stitch theme colours → light / dark pairs. */
export const S = {
  card: "rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:bg-[#111a2e] dark:shadow-none dark:ring-1 dark:ring-[#1e293b]",
  low: "bg-[#f2f3fe] dark:bg-[#0b1220]", // surface-container-low
  mid: "bg-[#ecedf8] dark:bg-[#1e293b]", // surface-container
  high: "bg-[#e7e7f2] dark:bg-[#1e293b]", // surface-container-high
  highest: "bg-[#e1e2ec] dark:bg-[#273449]", // surface-container-highest
  text: "text-[#191b23] dark:text-[#e2e8f0]", // on-surface
  muted: "text-[#434655] dark:text-[#94a3b8]", // on-surface-variant
  outline: "text-[#737686] dark:text-[#64748b]", // outline
  secondary: "text-[#555e75] dark:text-[#94a3b8]",
  primary: "text-[#003ea9] dark:text-[#93b4ff]",
  primaryFixed: "bg-[#dbe1ff] dark:bg-[#1e3a8a]/40",
  secContainer: "bg-[#d9e2fe] text-[#5b647c] dark:bg-[#1e3a8a]/50 dark:text-[#c7d2fe]",
  divider: "border-[#e7e7f2] dark:border-[#1e293b]",
  amberBg: "bg-[#ffddb4] text-[#291800] dark:bg-[#451a03] dark:text-[#fde68a]", // tertiary-fixed
  amberSoft: "bg-[#ffddb4]/40 dark:bg-[#451a03]/60",
  amberText: "text-[#634000] dark:text-[#fbbf24]",
  greenChip: "bg-[#e8f5ed] text-[#006e31] dark:bg-[#14532d] dark:text-[#4ade80]",
  errorText: "text-[#ba1a1a] dark:text-[#f87171]",
  errorSoft: "bg-[#ffdad6]/50 dark:bg-[#450a0a]",
  mono: "font-['JetBrains_Mono',ui-monospace,monospace]",
} as const;

/* Stitch type scale (font-* text-* pairs in the exports). */
export const T = {
  headlineLg: "text-[24px] leading-[32px] tracking-[-0.015em] font-semibold",
  headlineSm: "text-[18px] leading-[26px] tracking-[-0.01em] font-semibold",
  bodyLg: "text-[16px] leading-[24px]",
  bodyMd: "text-[14px] leading-[20px]",
  bodySm: "text-[12px] leading-[18px]",
  labelLg: "text-[14px] leading-[20px] tracking-[0.005em] font-medium",
  labelMd: "text-[12px] leading-[16px] tracking-[0.01em] font-medium",
  labelSm: "text-[11px] leading-[14px] tracking-[0.03em] font-semibold",
} as const;

/* Buttons: one solid primary, grey secondary, white raised, red-outline Cancel. */
const BTN = `inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-5 ${T.labelLg} transition-colors disabled:cursor-not-allowed disabled:opacity-50`;
export const BTN_PRIMARY = `${BTN} gap-2 px-6 bg-[#0153dc] text-white shadow-sm hover:bg-[#003ea9] dark:bg-[#2563eb] dark:hover:bg-[#1d4ed8]`;
export const BTN_GREY = `${BTN} bg-[#ecedf8] text-[#191b23] hover:bg-[#e7e7f2] dark:bg-[#1e293b] dark:text-[#e2e8f0] dark:hover:bg-[#273449]`;
export const BTN_WHITE = `${BTN} bg-white text-[#191b23] shadow-sm ring-1 ring-[#e7e7f2] hover:bg-[#ecedf8] dark:bg-[#111a2e] dark:text-[#e2e8f0] dark:ring-[#1e293b] dark:hover:bg-[#1e293b]`;
export const BTN_CANCEL = `${BTN} border border-[#ba1a1a] bg-white text-[#ba1a1a] shadow-sm hover:bg-[#ffdad6]/30 dark:border-[#f87171] dark:bg-transparent dark:text-[#f87171] dark:hover:bg-[#450a0a]`;

export { DIcon };

/** Stitch icons per powertrain (screens 02, 05, 08). */
export const PT_ICON: Record<string, string> = {
  ice: "engineering",
  mhev: "eco",
  hev: "battery_charging_full",
  phev: "power",
  erev: "alt_route",
  bev: "bolt",
  fcev: "water_drop",
};

/** Icon tile colour per option, as Stitch 02 draws the list. */
export const PT_TILE: Record<string, string> = {
  ice: `${S.mid} ${S.secondary}`,
  mhev: `${S.mid} ${S.secondary}`,
  hev: `${S.mid} ${S.secondary}`,
  phev: "bg-[#d9e2fe]/60 text-[#5b647c] dark:bg-[#1e3a8a]/40 dark:text-[#c7d2fe]",
  erev: "bg-[#d9e2fe]/60 text-[#5b647c] dark:bg-[#1e3a8a]/40 dark:text-[#c7d2fe]",
  bev: `${S.primaryFixed} ${S.primary}`,
  fcev: `bg-[#d9e2fe] dark:bg-[#1e3a8a]/50 ${S.primary}`,
};

/** One plain line under each option in the powertrain list. */
export const PT_HINT: Record<string, string> = {
  ice: "Engine only, no drive battery (ICE)",
  mhev: "Engine with a small 48-volt helper battery (MHEV)",
  hev: "Engine plus a self-charging battery (HEV)",
  phev: "Engine plus a battery you plug in (PHEV)",
  erev: "Electric drive, small engine charges it (EREV)",
  bev: "Battery and motor only, no engine (BEV)",
  fcev: "Electric drive powered by hydrogen (FCEV)",
};

/** Helper sentence under the powertrain select: "<name> = …". */
export const PT_MEANS: Record<string, string> = {
  ice: "a petrol or diesel engine with no drive battery.",
  mhev: "an engine with a small 48-volt helper battery. It can't drive on electric alone.",
  hev: "a petrol or diesel engine plus a high-voltage battery that can't be plugged in.",
  phev: "an engine plus a high-voltage battery you plug in to charge.",
  erev: "electric drive with a small engine that only charges the battery.",
  bev: "a high-voltage battery and electric motor, with no engine.",
  fcev: "electric drive powered by a hydrogen fuel cell.",
};

export const FUEL_ICON: Record<string, string> = {
  petrol: "local_gas_station",
  diesel: "local_gas_station",
  cng: "propane_tank",
  hydrogen: "water_drop",
  electric: "electric_bolt",
};

/** Rounded status chip (Worked out / Confirmed / Needs checking / Editing). */
export function SChip({
  tone,
  icon,
  filled,
  dot,
  children,
  testId,
}: {
  tone: "grey" | "green" | "amber" | "blue";
  icon?: string;
  filled?: boolean;
  dot?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  const c =
    tone === "green"
      ? `${S.greenChip} font-semibold`
      : tone === "amber"
        ? S.amberBg
        : tone === "blue"
          ? `${S.secContainer} font-semibold shadow-sm`
          : `${S.mid} ${S.muted}`;
  return (
    <span data-testid={testId} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 ${T.labelMd} ${c}`}>
      {dot ? <span className="h-2 w-2 rounded-full bg-[#0153dc] dark:bg-[#93b4ff]" /> : null}
      {icon ? (
        <DIcon name={icon} filled={filled} className={`text-[15px] ${tone === "grey" ? S.primary : ""}`} />
      ) : null}
      {children}
    </span>
  );
}

/** Amber "High-voltage" chip (lightning), shared by the drawer header and the HV switch. */
export function HvChip({ testId = "hv-chip" }: { testId?: string }) {
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${T.labelMd} ${S.amberBg}`}>
      <DIcon name="bolt" filled className="text-[14px]" /> High-voltage
    </span>
  );
}

/** Stitch 10 state 03: "Couldn't save this. Try again." strip with a red-outline Try again button. */
export function SaveFailed({
  onRetry,
  busy,
  title = "Couldn't save this. Try again.",
  detail = "Nothing was changed.",
}: {
  onRetry: () => void;
  busy?: boolean;
  title?: string;
  detail?: string;
}) {
  return (
    <div role="alert" data-testid="save-failed" className="rounded-xl bg-[#ffdad6]/60 p-4 shadow-sm dark:bg-[#450a0a]">
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ba1a1a] text-white dark:bg-[#dc2626]">
          <DIcon name="warning" className="text-[20px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <h4 className={`${T.labelLg} font-semibold text-[#93000a] dark:text-[#fca5a5]`}>{title}</h4>
            <button
              type="button"
              disabled={busy}
              onClick={onRetry}
              className={`inline-flex items-center gap-1 self-start rounded-lg border border-[#ba1a1a] bg-white px-3 py-1 shadow-sm ${T.labelMd} font-semibold text-[#ba1a1a] hover:bg-[#ffdad6] disabled:opacity-50 dark:border-[#f87171] dark:bg-transparent dark:text-[#f87171] sm:self-auto`}
            >
              <DIcon name="refresh" className="text-[15px]" /> Try again
            </button>
          </div>
          <p className={`mt-0.5 ${T.bodySm} ${S.muted}`}>{detail}</p>
        </div>
      </div>
    </div>
  );
}

/** Stitch 10 state 04: "Couldn't count right now" strip with a Retry button. */
export function CountFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" data-testid="count-failed" className={`flex items-center justify-between gap-4 rounded-xl p-3.5 ${S.amberSoft}`}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#835500] text-white dark:bg-[#b45309]">
          <DIcon name="warning" className="text-[18px]" />
        </div>
        <div>
          <span className={`${T.labelLg} font-semibold ${S.amberText}`}>Couldn&apos;t count right now</span>
          <p className={`mt-0.5 ${T.bodySm} ${S.muted}`}>Your choices can still be saved.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 shadow-sm ring-1 ring-[#e7e7f2] ${T.labelMd} ${S.text} hover:bg-[#ecedf8] dark:bg-[#111a2e] dark:ring-[#1e293b]`}
      >
        <DIcon name="refresh" className={`text-[16px] ${S.primary}`} /> Retry
      </button>
    </div>
  );
}
