/**
 * Shared look for the Fleet "Find parts for everyday people" screens, taken from the Stitch exports in
 * docs/stitch/fleet-find-parts-everyday/*\/code.html (cards, tiles, chips, buttons, icons).
 * Rule G5: every action is a visible, bordered button.
 */
import type { ReactNode } from "react";

export const TXT = "text-[#0b1c30] dark:text-[#fafafa]";
export const MUTED = "text-[#47464c] dark:text-[#a1a1aa]";
export const CARD =
  "rounded-[20px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] dark:bg-[#2a2a2d] dark:shadow-none dark:ring-1 dark:ring-[#3a3a3d]";
export const TILE = "rounded-2xl bg-[#eff4ff] dark:bg-[#1c1c1e]";
export const MONO = "font-['JetBrains_Mono',monospace] font-semibold tracking-[0.08em]";

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  // The Material Symbols stylesheet sets its own font-size and loads after Tailwind, so a text-[Npx] class can lose.
  // Pass the size inline so the icon always shows at the designed size.
  const px = /text-\[(\d+)px\]/.exec(className)?.[1];
  return (
    <span className={`material-symbols-outlined leading-none ${className}`} style={px ? { fontSize: `${px}px` } : undefined} aria-hidden>
      {name}
    </span>
  );
}

export function IconBox({ name, size = "md", className = "" }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "sm" ? "h-9 w-9 rounded-xl" : size === "lg" ? "h-16 w-16 rounded-2xl" : "h-12 w-12 rounded-2xl";
  const icon = size === "sm" ? "text-[18px]" : size === "lg" ? "text-[30px]" : "text-[26px]";
  return (
    <div className={`flex shrink-0 items-center justify-center bg-[#e5eeff] ${TXT} dark:bg-[#3a3a3d] ${box} ${className}`}>
      <Icon name={name} className={icon} />
    </div>
  );
}

type BtnKind = "primary" | "secondary" | "soft" | "danger";
const BTN: Record<BtnKind, string> = {
  primary:
    "border border-transparent bg-[#030213] text-white hover:opacity-90 dark:bg-[#fafafa] dark:text-[#030213]",
  secondary:
    "border border-[#cbd5e1] bg-white text-[#0b1c30] hover:bg-[#eff4ff] dark:border-[#3a3a3d] dark:bg-[#1c1c1e] dark:text-[#fafafa] dark:hover:bg-[#3a3a3d]",
  soft:
    "border border-[#cbd5e1] bg-[#e5eeff] text-[#0b1c30] hover:bg-[#dce9ff] dark:border-[#3a3a3d] dark:bg-[#2a2a2d] dark:text-[#fafafa]",
  danger:
    "border border-[#d4183d] bg-white text-[#d4183d] hover:bg-[#fff1f2] dark:bg-[#1c1c1e] dark:text-[#f87171] dark:border-[#f87171]",
};

export function SBtn({
  children,
  onClick,
  kind = "secondary",
  icon,
  iconAfter,
  className = "",
  size = "md",
  disabled,
  title,
}: {
  children?: ReactNode;
  onClick?: () => void;
  kind?: BtnKind;
  icon?: string;
  iconAfter?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  title?: string;
}) {
  const pad = size === "sm" ? "px-3 py-1.5 text-sm" : size === "lg" ? "px-6 py-3.5 text-base" : "px-4 py-2.5 text-[15px]";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[0.98] disabled:opacity-50 ${pad} ${BTN[kind]} ${className}`}
    >
      {icon ? <Icon name={icon} className="text-[18px]" /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} className="text-[18px]" /> : null}
    </button>
  );
}

/** Small round icon-only button with a visible border (copy, back, close). */
export function SIconBtn({ icon, onClick, label, className = "" }: { icon: string; onClick?: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#cbd5e1] bg-white text-[#47464c] transition-colors hover:bg-[#eff4ff] hover:text-[#0b1c30] dark:border-[#3a3a3d] dark:bg-[#1c1c1e] dark:text-[#a1a1aa] dark:hover:text-[#fafafa] ${className}`}
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  );
}

/** Pill button (popular chips, filters). Selected = solid near-black. */
export function SChip({
  children,
  onClick,
  selected,
  icon,
  count,
}: {
  children: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  icon?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all ${
        selected
          ? "border-[#030213] bg-[#030213] text-white dark:border-[#fafafa] dark:bg-[#fafafa] dark:text-[#030213]"
          : "border-[#cbd5e1] bg-[#eff4ff] text-[#0b1c30] hover:bg-[#e5eeff] dark:border-[#3a3a3d] dark:bg-[#1c1c1e] dark:text-[#fafafa]"
      }`}
    >
      {icon ? <Icon name={icon} className="text-[16px]" /> : null}
      {children}
      {count != null ? (
        <span className={`rounded-full px-1.5 text-[11px] ${selected ? "bg-white/20" : "bg-white dark:bg-[#3a3a3d]"}`}>{count}</span>
      ) : null}
    </button>
  );
}

/** Plate chip: light (on cards) or dark (car header), with the orange dot. */
export function SPlate({ plate, tone = "light" }: { plate: string; tone?: "light" | "dark" }) {
  if (!plate) return null;
  const cls =
    tone === "dark"
      ? "bg-[#0b1c30] text-white dark:bg-[#fafafa] dark:text-[#0b1c30]"
      : "bg-[#dce9ff] text-[#0b1c30] dark:bg-[#3a3a3d] dark:text-[#fafafa]";
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 ${MONO} text-[13px] shadow-sm ${cls}`}>
      <span className="h-3 w-1 rounded-full bg-[#ea580c]" />
      {plate}
    </span>
  );
}

export function SStatusPill({ tone, children, icon }: { tone: "amber" | "green" | "gray"; children: ReactNode; icon?: string }) {
  const cls =
    tone === "green"
      ? "bg-[#ecfdf5] text-[#059669] dark:bg-[#064e3b] dark:text-[#34d399]"
      : tone === "amber"
        ? "bg-[#fffbeb] text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]"
        : "bg-[#f1f5f9] text-[#47464c] dark:bg-[#3a3a3d] dark:text-[#a1a1aa]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${cls}`}>
      {icon ? <Icon name={icon} className="text-[14px]" /> : null}
      {children}
    </span>
  );
}

export function SPageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div className="flex flex-col gap-1.5">
        <h1 className={`text-[28px] font-semibold leading-9 tracking-tight sm:text-[32px] ${TXT}`}>{title}</h1>
        {subtitle ? <p className={`text-base ${MUTED}`}>{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function SSearch({
  value,
  onChange,
  onEnter,
  onFocus,
  placeholder,
  onClear,
  big,
}: {
  value?: string;
  onChange?: (v: string) => void;
  onEnter?: (v: string) => void;
  onFocus?: () => void;
  placeholder: string;
  onClear?: () => void;
  big?: boolean;
}) {
  return (
    <div className="relative w-full">
      <Icon name="search" className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[22px] ${MUTED}`} />
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.((e.target as HTMLInputElement).value);
        }}
        placeholder={placeholder}
        className={`w-full rounded-xl border border-[#dce9ff] bg-[#eff4ff] pl-12 pr-12 text-base text-[#0b1c30] shadow-inner outline-none transition-all placeholder:text-[#47464c] focus:border-[#cbd5e1] focus:bg-white focus:shadow-md dark:border-[#3a3a3d] dark:bg-[#1c1c1e] dark:text-[#fafafa] dark:placeholder:text-[#a1a1aa] ${big ? "h-14" : "h-12"}`}
      />
      {onClear && value ? (
        <SIconBtn icon="close" label="Clear search" onClick={onClear} className="absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full" />
      ) : null}
    </div>
  );
}

/** Material icon for an area (car home tiles). */
export function areaIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("brake")) return "disc_full";
  if (n.includes("engine")) return "oil_barrel";
  if (n.includes("filter")) return "filter_alt";
  if (n.includes("fluid")) return "water_drop";
  if (n.includes("suspension") || n.includes("steering")) return "compress";
  if (n.includes("light") || n.includes("wiper") || n.includes("visib")) return "wb_twilight";
  if (n.includes("battery") || n.includes("electric")) return "battery_charging_full";
  if (n.includes("cool") || n.includes("heat")) return "ac_unit";
  if (n.includes("transmission") || n.includes("gear")) return "settings";
  return "build";
}

/** Material icon for a part type row. */
export function partIcon(idOrName: string): string {
  const n = idOrName.toLowerCase();
  if (n.includes("shock")) return "height";
  if (n.includes("pad")) return "layers";
  if (n.includes("disc") || n.includes("rotor")) return "radio_button_checked";
  if (n.includes("caliper")) return "handyman";
  if (n.includes("sensor") || n.includes("abs")) return "speed";
  if (n.includes("shoe")) return "circle";
  if (n.includes("drum")) return "radio_button_unchecked";
  if (n.includes("cylinder") && n.includes("master")) return "precision_manufacturing";
  if (n.includes("cylinder")) return "swap_horiz";
  if (n.includes("cable")) return "cable";
  if (n.includes("hose")) return "alt_route";
  if (n.includes("fluid")) return "water_drop";
  if (n.includes("booster")) return "compress";
  if (n.includes("shock")) return "height";
  if (n.includes("oil")) return "oil_barrel";
  if (n.includes("filter")) return "filter_alt";
  if (n.includes("wiper")) return "brush";
  if (n.includes("plug")) return "bolt";
  return "build";
}

export function needIcon(label: string): string {
  const n = label.toLowerCase();
  if (n.includes("brake")) return "opacity";
  if (n.includes("cvt") || n.includes("gear") || n.includes("transmission")) return "autorenew";
  if (n.includes("wiper")) return "brush";
  if (n.includes("coolant")) return "ac_unit";
  if (n.includes("tyre") || n.includes("tire")) return "trip_origin";
  if (n.includes("battery")) return "battery_charging_full";
  return "oil_barrel";
}
