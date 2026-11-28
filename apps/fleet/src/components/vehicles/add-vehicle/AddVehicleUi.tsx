/**
 * Building blocks for the Add a vehicle flow — ported from the owner's Stitch screens
 * (docs/stitch/vehicle-add-fleet-prompt.txt, audit §18.1). Look only; no data logic here.
 */
import React, { useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  FileUp,
  Lock,
  Loader2,
  ScanLine,
  Sun,
  Focus,
  X,
  CircleAlert,
  Clock,
  Hourglass,
  CalendarDays,
} from "lucide-react";
import { cn } from "../../ui/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-12" → "12 Mar 2026" (Stitch F3/F5 date look). */
export function plainDateWords(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return "";
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : "";
}
import { MakerLogo } from "../find-parts/everyday/EverydayShared";
import {
  COLOR_SWATCH,
  VEHICLE_COLORS,
  colorLabel,
  needsSwatchRing,
  type VehicleColor,
} from "./vehicleColors";

/* ------------------------------------------------------------------ frame */

export function FlowShell({ children, crumb = "Add a vehicle" }: { children: React.ReactNode; crumb?: string }) {
  return (
    <div className="min-h-full w-full bg-[#f8fafc] dark:bg-[#1c1c1e]">
      <nav
        aria-label="Breadcrumb"
        className="flex h-10 items-center gap-1 bg-[#eff4ff] px-4 text-[13px] text-[#47464c] md:px-10 dark:bg-[#2a2a2d] dark:text-[#a1a1aa]"
      >
        <span>Vehicle Operations</span>
        <ChevronRight className="h-4 w-4 text-[#c9c5cd]" aria-hidden />
        <span>Vehicles</span>
        <ChevronRight className="h-4 w-4 text-[#c9c5cd]" aria-hidden />
        <span className="font-medium text-[#0b1c30] dark:text-[#fafafa]">{crumb}</span>
      </nav>
      <div className="flex w-full justify-center px-4 py-8 md:px-10">
        <div className="relative flex w-full max-w-[760px] flex-col gap-6 rounded-[20px] border border-black/[0.06] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] sm:p-6 dark:border-[#3a3a3d] dark:bg-[#2a2a2d]">
          {children}
        </div>
      </div>
    </div>
  );
}

const STEPS = ["Fitness", "Registration", "Vehicle use", "Confirm car", "Odometer", "Done"] as const;
export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** 1 Fitness · 2 Registration · 3 Vehicle use · 4 Confirm car · 5 Odometer (and use) · 6 Done. Steps before `current` show a green check. */
export function StepBar({ current }: { current: StepNumber }) {
  return (
    <div className="w-full py-1" aria-label={`Step ${current} of ${STEPS.length} · ${STEPS[current - 1]}`}>
      <ol className="relative grid grid-cols-6 items-center">
        <div className="absolute left-[10%] right-[10%] top-1/2 h-[2px] -translate-y-1/2 bg-[#e5eeff] dark:bg-[#3a3a3d]" aria-hidden />
        {STEPS.map((label, i) => {
          const n = (i + 1) as StepNumber;
          const done = n < current;
          const active = n === current;
          const align = i === 0 ? "sm:justify-start" : i === STEPS.length - 1 ? "sm:justify-end" : "sm:justify-center";
          return (
            <li key={label} className={cn("relative z-10 flex justify-center", align)} aria-current={active ? "step" : undefined}>
              {active ? (
                <span className="flex items-center gap-1.5 rounded-full bg-[#030213] py-1 pl-1.5 pr-3 text-white shadow-[0_2px_4px_rgba(0,0,0,0.1)] dark:bg-[#fafafa] dark:text-[#030213]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#030213] dark:bg-[#030213] dark:text-white">
                    {n}
                  </span>
                  <span className="text-xs font-semibold">{label}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 dark:bg-[#2a2a2d]">
                  {done ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ecfdf5] text-[#059669] dark:bg-[#064e3b] dark:text-[#34d399]">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e5eeff] text-xs font-semibold text-[#47464c] dark:bg-[#3a3a3d] dark:text-[#a1a1aa]">
                      {n}
                    </span>
                  )}
                  <span
                    className={cn(
                      "hidden text-[13px] sm:inline",
                      done ? "font-medium text-[#047857] dark:text-[#34d399]" : "text-[#47464c] dark:text-[#a1a1aa]",
                    )}
                  >
                    {label}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function FlowTitle({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      {icon}
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold leading-[34px] tracking-[-0.015em] text-[#0a0a0a] dark:text-[#fafafa]">{title}</h1>
        {subtitle ? <p className="text-base text-[#64748b] dark:text-[#a1a1aa]">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function PrivacyLine() {
  return (
    <p className="flex items-center gap-2 text-[13px] text-[#64748b] dark:text-[#a1a1aa]">
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      We read your certificate and keep the details — not the file.
    </p>
  );
}

/* ---------------------------------------------------------------- buttons */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "danger" | "dangerSolid";
  wide?: boolean;
  busy?: boolean;
};

/** Button rule: primary solid, secondary with a visible border, danger red border + red text. Never a text link. */
export function FlowButton({ tone = "secondary", wide, busy, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        tone === "primary" &&
          "bg-[#030213] text-white hover:bg-[#1e1d2e] dark:bg-[#fafafa] dark:text-[#030213] dark:hover:bg-white",
        tone === "secondary" &&
          "border border-[#cbd5e1] bg-white text-[#0a0a0a] hover:bg-[#f8fafc] dark:border-[#3a3a3d] dark:bg-[#2a2a2d] dark:text-[#fafafa] dark:hover:bg-[#3a3a3d]",
        tone === "danger" &&
          "border border-[#d4183d] bg-white text-[#d4183d] hover:bg-[#fff1f2] dark:border-[#f87171] dark:bg-transparent dark:text-[#f87171] dark:hover:bg-[#450a0a]",
        tone === "dangerSolid" && "bg-[#d4183d] text-white hover:bg-[#b3122f]",
        wide && "w-full",
        className,
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Footer: Cancel alone on the left, actions on the right; stacks full-width on phones (primary first). */
export function FlowFooter({ onCancel, children, hint }: { onCancel?: () => void; children?: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-black/[0.06] pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-[#3a3a3d]">
      {onCancel ? (
        <FlowButton tone="danger" onClick={onCancel} className="w-full sm:w-auto">
          <X className="h-4 w-4" aria-hidden />
          Cancel
        </FlowButton>
      ) : (
        <span />
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {hint ? <span className="text-center text-[13px] text-[#64748b] sm:text-right dark:text-[#a1a1aa]">{hint}</span> : null}
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- drop zone */

export function DropZone({
  title,
  onFile,
}: {
  title: string;
  onFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (list: FileList | null) => {
    const f = list?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files);
      }}
      className={cn(
        "flex min-h-[230px] w-full flex-col items-center justify-center rounded-[20px] border-2 p-6 text-center transition-colors",
        over
          ? "border-[#030213] bg-[#f1f5f9] dark:border-[#fafafa] dark:bg-[#3a3a3d]"
          : "border-[#e2e8f0] bg-[#f8faff] dark:border-[#3a3a3d] dark:bg-[#1c1c1e]",
      )}
    >
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
        aria-label="Choose file"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        aria-label="Take photo"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:bg-[#2a2a2d]">
        <ScanLine className="h-7 w-7 text-[#030213] dark:text-[#fafafa]" aria-hidden />
      </div>
      <p className="text-[17px] font-semibold text-[#0a0a0a] dark:text-[#fafafa]">{title}</p>
      <p className="mt-1 text-[13px] text-[#64748b] dark:text-[#a1a1aa]">JPG, PNG, HEIC or PDF · up to 8 MB</p>
      {/* Desktop: Choose file is the main action (Stitch screen 1). */}
      <div className="mt-5 hidden gap-3 sm:flex">
        <FlowButton tone="primary" onClick={() => fileRef.current?.click()}>
          <FileUp className="h-4 w-4" aria-hidden />
          Choose file
        </FlowButton>
        <FlowButton tone="secondary" onClick={() => cameraRef.current?.click()}>
          <Camera className="h-4 w-4" aria-hidden />
          Take photo
        </FlowButton>
      </div>
      {/* Phone: the camera comes first (Stitch screen 12). */}
      <div className="mt-5 flex w-full flex-col gap-3 sm:hidden">
        <FlowButton tone="primary" wide onClick={() => cameraRef.current?.click()}>
          <Camera className="h-4 w-4" aria-hidden />
          Take photo
        </FlowButton>
        <FlowButton tone="secondary" wide onClick={() => fileRef.current?.click()}>
          <FileUp className="h-4 w-4" aria-hidden />
          Choose file
        </FlowButton>
      </div>
    </div>
  );
}

export function TipChips() {
  const tips = [
    { icon: <Check className="h-4 w-4" aria-hidden />, label: "Whole page in view" },
    { icon: <Sun className="h-4 w-4" aria-hidden />, label: "Good light" },
    { icon: <Focus className="h-4 w-4" aria-hidden />, label: "Not blurry" },
  ];
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tips.map((t) => (
        <li key={t.label} className="flex items-center gap-3 rounded-2xl bg-[#eff4ff] px-4 py-3 text-[15px] text-[#0a0a0a] dark:bg-[#1c1c1e] dark:text-[#fafafa]">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#030213] text-[#85f8c4] dark:bg-[#fafafa] dark:text-[#059669]">{t.icon}</span>
          {t.label}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- reading */

export function ReadingCard({ fileName, sizeLabel, rows }: { fileName: string; sizeLabel: string; rows: string[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-2xl bg-[#eff4ff] p-4 dark:bg-[#1c1c1e]">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-[#2a2a2d]">
          <ScanLine className="h-6 w-6 text-[#030213] dark:text-[#fafafa]" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold text-[#0a0a0a] dark:text-[#fafafa]">{fileName}</p>
          <p className="text-[13px] text-[#64748b] dark:text-[#a1a1aa]">{sizeLabel}</p>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5eeff] dark:bg-[#3a3a3d]" role="progressbar" aria-label="Reading your certificate">
        <div className="h-full w-1/3 animate-[addVehicleProgress_1.6s_ease-in-out_infinite] rounded-full bg-[#2563eb] motion-reduce:animate-none motion-reduce:w-full" />
      </div>
      <ul className="flex flex-col gap-2" aria-live="polite">
        {rows.map((r) => (
          <li key={r} className="flex items-center gap-3 rounded-xl px-4 py-3 text-base text-[#0a0a0a] shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:text-[#fafafa]">
            <Loader2 className="h-5 w-5 animate-spin text-[#2563eb] motion-reduce:animate-none" aria-hidden />
            {r}
          </li>
        ))}
      </ul>
      <style>{`@keyframes addVehicleProgress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}

/* ----------------------------------------------------------------- fields */

/** A pick-one field in the same light tile as FieldInput (Vehicle use step). "Filled by Roam" until the person changes it. */
export function ChoiceTile({
  label,
  value,
  onChange,
  options,
  filled,
  required,
  loading,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  filled?: boolean;
  required?: boolean;
  loading?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-[#eff4ff] p-4 dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[#47464c] dark:text-[#a1a1aa]">
          {label}
          {required ? <span className="ml-0.5 text-[#d4183d]">*</span> : null}
        </span>
        {filled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#dbe1ff] px-2 py-0.5 text-[11px] font-semibold text-[#003ea8] dark:bg-[#172554] dark:text-[#60a5fa]">
            <Check className="h-3 w-3" aria-hidden />
            Filled by Roam
          </span>
        ) : null}
      </div>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={loading}>
        <SelectTrigger
          aria-label={label}
          data-testid={testId}
          className="h-12 w-full rounded-xl border border-black/[0.08] bg-white px-3.5 text-base font-medium text-[#0b1c30] shadow-[0_1px_2px_rgba(0,0,0,0.03)] focus:ring-2 focus:ring-[#030213] dark:border-[#3a3a3d] dark:bg-[#2a2a2d] dark:text-[#fafafa]"
        >
          <SelectValue placeholder={loading ? "Loading…" : "Not set"} />
        </SelectTrigger>
        <SelectContent>
          {!required ? <SelectItem value="none">Not set</SelectItem> : null}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FieldInput({
  label,
  value,
  onChange,
  read,
  edited,
  flagged,
  type = "text",
  mono,
  required,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  read?: boolean;
  edited?: boolean;
  flagged?: boolean;
  type?: "text" | "date";
  mono?: boolean;
  required?: boolean;
  placeholder?: string;
  testId?: string;
}) {
  const id = `fld-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-[#47464c] dark:text-[#a1a1aa]">
          {label}
          {required ? <span className="ml-0.5 text-[#d4183d]">*</span> : null}
        </label>
        {edited ? (
          <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#475569] dark:bg-[#3a3a3d] dark:text-[#a1a1aa]">Edited</span>
        ) : read ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#dbe1ff] px-2 py-0.5 text-[11px] font-semibold text-[#003ea8] dark:bg-[#172554] dark:text-[#60a5fa]">
            <Check className="h-3 w-3" aria-hidden />
            Read by Roam
          </span>
        ) : null}
      </div>
      {type === "date" ? (
        /* Stitch F3: the date reads in words ("12 Mar 2026") with a calendar icon; the real date input sits on top. */
        <div
          className={cn(
            "relative flex h-12 w-full items-center justify-between rounded-xl border bg-white px-3.5 text-base font-medium text-[#0b1c30] shadow-[0_1px_2px_rgba(0,0,0,0.03)] focus-within:ring-2 focus-within:ring-[#030213] dark:bg-[#1c1c1e] dark:text-[#fafafa] dark:focus-within:ring-[#fafafa]",
            flagged ? "border-[#b45309] bg-[#fffbeb] dark:bg-[#451a03]" : "border-black/[0.08] dark:border-[#3a3a3d]",
          )}
        >
          <span className={value ? "" : "text-[#94a3b8]"}>{plainDateWords(value) || placeholder || "Pick a date"}</span>
          <CalendarDays className="h-5 w-5 text-[#47464c] dark:text-[#a1a1aa]" aria-hidden />
          <input
            id={id}
            data-testid={testId}
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* older browsers open it themselves */
              }
            }}
            aria-invalid={flagged || undefined}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
      ) : (
        <input
          id={id}
          data-testid={testId}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={flagged || undefined}
          className={cn(
            "h-12 w-full rounded-xl border bg-white px-3.5 text-base font-medium text-[#0b1c30] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all focus:outline-none focus:ring-2 focus:ring-[#030213] dark:bg-[#1c1c1e] dark:text-[#fafafa] dark:focus:ring-[#fafafa]",
            flagged ? "border-[#b45309] bg-[#fffbeb] dark:bg-[#451a03]" : "border-black/[0.08] dark:border-[#3a3a3d]",
            mono && "font-mono tracking-wide",
          )}
        />
      )}
      {flagged ? (
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#b45309] dark:text-[#fbbf24]">
          <CircleAlert className="h-4 w-4" aria-hidden />
          Check this date — it couldn't be read clearly, please enter it.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ colour */

export function ColorDot({ color, size = 14 }: { color: VehicleColor; size?: number }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", needsSwatchRing(color) && "ring-1 ring-[#94a3b8]")}
      style={{ width: size, height: size, background: COLOR_SWATCH[color] }}
    />
  );
}

export function ColorChip({ color }: { color: VehicleColor }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-3 py-1 text-[15px] font-medium text-[#0a0a0a] dark:border-[#3a3a3d] dark:bg-[#1c1c1e] dark:text-[#fafafa]">
      <ColorDot color={color} />
      {colorLabel(color)}
    </span>
  );
}

/** Colour card with the 16-colour dropdown. No match → amber "Pick a colour" and the caller blocks Next (T29). */
export function ColorCard({
  value,
  certificateSays,
  registrationSays,
  read,
  edited,
  onChange,
}: {
  value: VehicleColor | null;
  certificateSays: string;
  registrationSays?: string | null;
  read?: boolean;
  edited?: boolean;
  onChange: (c: VehicleColor) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[#eff4ff] p-5 dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium text-[#0b1c30] dark:text-[#fafafa]">Colour</span>
        {edited ? (
          <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#475569]">Edited</span>
        ) : read && value ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#dbe1ff] px-2 py-0.5 text-[11px] font-semibold text-[#003ea8]">
            <Check className="h-3 w-3" aria-hidden />
            Read by Roam
          </span>
        ) : null}
      </div>
      <div className="relative">
        <button
          type="button"
          data-testid="colour-chip"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-base font-medium shadow-sm",
            value
              ? "border-black/[0.08] bg-white text-[#0a0a0a] dark:border-[#3a3a3d] dark:bg-[#2a2a2d] dark:text-[#fafafa]"
              : "border-[#b45309] bg-[#fffbeb] text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]",
          )}
        >
          {value ? <ColorDot color={value} /> : <CircleAlert className="h-4 w-4" aria-hidden />}
          {value ? colorLabel(value) : "Pick a colour"}
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
        {open ? (
          <ul
            role="listbox"
            aria-label="Colour"
            className="absolute z-20 mt-2 max-h-72 w-60 overflow-y-auto rounded-2xl border border-black/[0.08] bg-white p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:border-[#3a3a3d] dark:bg-[#2a2a2d]"
          >
            {VEHICLE_COLORS.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c === value}
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[15px] text-[#0a0a0a] hover:bg-[#f8fafc] dark:text-[#fafafa] dark:hover:bg-[#3a3a3d]"
                >
                  <ColorDot color={c} />
                  <span className="flex-1">{colorLabel(c)}</span>
                  {c === value ? <Check className="h-4 w-4 text-[#059669]" aria-hidden /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {certificateSays ? (
        <p className="text-[13px] text-[#47464c] dark:text-[#a1a1aa]">
          Certificate says: <span className="font-semibold uppercase">{certificateSays}</span>
        </p>
      ) : null}
      {registrationSays ? (
        <p className="text-[13px] text-[#b45309] dark:text-[#fbbf24]">
          The registration says <span className="font-semibold uppercase">{registrationSays}</span> — pick the right one.
        </p>
      ) : null}
      {!value ? (
        <p className="text-[13px] font-medium text-[#b45309] dark:text-[#fbbf24]">Pick the colour that's closest to continue.</p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- notices */

export function Notice({ tone, icon, title, body }: { tone: "amber" | "blue" | "red" | "green"; icon?: React.ReactNode; title: string; body?: React.ReactNode }) {
  const tones = {
    amber: "bg-[#fffbeb] text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]",
    blue: "bg-[#eff6ff] text-[#2563eb] dark:bg-[#172554] dark:text-[#60a5fa]",
    red: "bg-[#fff1f2] text-[#d4183d] dark:bg-[#450a0a] dark:text-[#f87171]",
    green: "bg-[#ecfdf5] text-[#047857] dark:bg-[#064e3b] dark:text-[#34d399]",
  } as const;
  return (
    <div className={cn("flex gap-3 rounded-2xl p-4", tones[tone])} role={tone === "red" || tone === "amber" ? "status" : undefined}>
      {icon ?? <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />}
      <div>
        <p className="font-semibold">{title}</p>
        {body ? <div className="mt-1 text-[15px] opacity-90">{body}</div> : null}
      </div>
    </div>
  );
}

export function StatusChip({ tone, children }: { tone: "green" | "amber" | "slate" | "red"; children: React.ReactNode }) {
  const tones = {
    green: "bg-[#ecfdf5] text-[#047857] dark:bg-[#064e3b] dark:text-[#34d399]",
    amber: "bg-[#fffbeb] text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]",
    slate: "bg-[#f1f5f9] text-[#475569] dark:bg-[#3a3a3d] dark:text-[#a1a1aa]",
    red: "bg-[#fff1f2] text-[#d4183d] dark:bg-[#450a0a] dark:text-[#f87171]",
  } as const;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium", tones[tone])}>{children}</span>;
}

/* ------------------------------------------------------------------ car */

/** 4:3 frame: the studio picture, or the grey outline with a label. Shimmer only while a picture is being made. */
export function PictureFrame({ url, label, shimmer, chip }: { url?: string | null; label?: string; shimmer?: boolean; chip?: React.ReactNode }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-black/[0.06] bg-white dark:border-[#3a3a3d] dark:bg-[#1c1c1e]">
      {chip ? <div className="absolute left-3 top-3 z-10">{chip}</div> : null}
      {url ? (
        <img src={url} alt="Studio picture of this car" className="h-full w-full object-contain" />
      ) : (
        <div className={cn("flex h-full w-full flex-col items-center justify-center gap-3 bg-[#f8fafc] p-4 dark:bg-[#1c1c1e]", shimmer && "animate-pulse motion-reduce:animate-none")}>
          <CarOutline />
          {label ? <p className="text-center text-[13px] font-medium text-[#475569] dark:text-[#a1a1aa]">{label}</p> : null}
        </div>
      )}
    </div>
  );
}

export function CarOutline() {
  return (
    <svg viewBox="0 0 220 90" className="h-20 w-48 text-[#94a3b8]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 66h18M66 66h82M182 66h22v-14c0-6-4-9-10-10l-26-5-24-17c-4-3-8-4-13-4H82c-6 0-10 2-14 6L52 38l-28 5c-6 1-10 5-10 11v12" />
      <circle cx="49" cy="66" r="15" />
      <circle cx="165" cy="66" r="15" />
      <path d="M72 38h42V25M120 38h38" />
    </svg>
  );
}

export function CarSummary({
  make,
  title,
  subtitle,
  color,
  plate,
  extra,
}: {
  make: string;
  title: string;
  subtitle?: string;
  color?: VehicleColor | null;
  plate?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <MakerLogo make={make || "Car"} size={48} />
        <div>
          <p className="text-2xl font-semibold text-[#0a0a0a] dark:text-[#fafafa]">{title}</p>
          {subtitle ? <p className="text-[15px] text-[#64748b] dark:text-[#a1a1aa]">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {color ? <ColorChip color={color} /> : null}
        {plate ? (
          <span className="inline-flex items-center rounded-lg border border-black/10 bg-[#f1f5f9] px-3 py-1 font-mono text-[15px] font-bold tracking-[0.14em] text-[#0a0a0a] dark:border-white/10 dark:bg-[#3a3a3d] dark:text-[#fafafa]">
            {plate}
          </span>
        ) : null}
      </div>
      {extra}
    </div>
  );
}

/* --------------------------------------------------------------- problems */

export function ProblemScreen({
  tone,
  title,
  body,
  tips,
}: {
  tone: "red" | "amber";
  title: string;
  body: string;
  tips?: Array<{ title: string; body: string; icon: React.ReactNode }>;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div
        className={cn(
          "flex h-20 w-20 items-center justify-center rounded-full",
          tone === "red" ? "bg-[#fff1f2] text-[#d4183d] dark:bg-[#450a0a] dark:text-[#f87171]" : "bg-[#fffbeb] text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]",
        )}
      >
        {tone === "red" ? <CircleAlert className="h-9 w-9" aria-hidden /> : <Clock className="h-9 w-9" aria-hidden />}
      </div>
      <h1 className="text-[26px] font-semibold text-[#0a0a0a] dark:text-[#fafafa]">{title}</h1>
      <p className="max-w-md text-base text-[#47464c] dark:text-[#a1a1aa]">{body}</p>
      {tips ? (
        <ul className="mt-2 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-3">
          {tips.map((t) => (
            <li key={t.title} className="flex flex-col gap-2 rounded-2xl bg-[#eff4ff] p-4 dark:bg-[#1c1c1e]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#0a0a0a] dark:bg-[#2a2a2d] dark:text-[#fafafa]">{t.icon}</span>
              <p className="font-semibold text-[#0a0a0a] dark:text-[#fafafa]">{t.title}</p>
              <p className="text-[14px] text-[#47464c] dark:text-[#a1a1aa]">{t.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { Hourglass };
