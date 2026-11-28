import type { ReactNode } from "react";
import { marketLabel } from "./manualsApi";

/** Stitch "Calm modern workspace" pieces for the Manuals screens (exact colours: Dominion runs dark too). */
export const BTN_PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#0153dc] px-5 text-[15px] font-semibold text-white hover:bg-[#0047c0] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_SECONDARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-[#c5c6d0] bg-white px-4 text-[15px] font-medium text-[#30323b] hover:bg-[#f3f4fb] disabled:cursor-not-allowed disabled:opacity-50";
export const BTN_DANGER =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-[#a83836] bg-white px-4 text-[15px] font-medium text-[#a83836] hover:bg-[#fdecec] disabled:cursor-not-allowed disabled:opacity-50";
export const CARD = "rounded-2xl border border-[#e6e7ee] bg-white shadow-[0_4px_16px_rgba(1,83,220,0.04)]";

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

export function MarketPill({ market }: { market: string }) {
  const m = marketLabel(market);
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#f1f5f9] px-3 text-[13px] text-[#30323b]">

      {m.label}
    </span>
  );
}

type Tone = "green" | "blue" | "amber" | "red" | "slate";
const TONES: Record<Tone, string> = {
  green: "bg-[#e6f4ea] text-[#006e31]",
  blue: "bg-[#dbe1ff] text-[#0047c0]",
  amber: "bg-[#fff4dc] text-[#8a5a00]",
  red: "bg-[#fdecec] text-[#a83836]",
  slate: "bg-[#f1f5f9] text-[#475569]",
};

export function Pill({ tone, icon, children }: { tone: Tone; icon?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex h-7 items-center gap-1 rounded-full px-3 text-[13px] font-medium ${TONES[tone]}`}>
      {icon ? <Icon name={icon} className="text-[16px]" /> : null}
      {children}
    </span>
  );
}

export function ManualStatusPill({ status }: { status: string }) {
  switch (status) {
    case "reading":
      return (
        <Pill tone="blue" icon="sync">
          Reading
        </Pill>
      );
    case "waiting_check":
      return (
        <Pill tone="amber" icon="pending_actions">
          Waiting for you
        </Pill>
      );
    case "checked":
      return (
        <Pill tone="green" icon="check">
          Checked
        </Pill>
      );
    case "rejected":
      return (
        <Pill tone="red" icon="block">
          Rejected
        </Pill>
      );
    case "stopped":
      return (
        <Pill tone="slate" icon="stop_circle">
          Stopped
        </Pill>
      );
    default:
      return <Pill tone="slate">{status}</Pill>;
  }
}

export function SourcePill({ source }: { source: string | null | undefined }) {
  if (source === "maker_manual")
    return (
      <Pill tone="green" icon="menu_book">
        Car maker
      </Pill>
    );
  if (source === "part_maker")
    return (
      <Pill tone="blue" icon="precision_manufacturing">
        Part maker
      </Pill>
    );
  return (
    <Pill tone="slate" icon="shield">
      Roam policy
    </Pill>
  );
}

/** "Every 10,000 km or 12 months" — the schedule sentence used everywhere. */
export function everyText(km: number | null | undefined, months: number | null | undefined): string {
  const parts: string[] = [];
  if (km) parts.push(`${Number(km).toLocaleString("en-US")} km`);
  if (months) parts.push(`${months} months`);
  return parts.length ? `Every ${parts.join(" or ")}` : "—";
}

export function dateText(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
