import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../services/api";

export function EverydayShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`fleet-find-parts-everyday mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function EverydayTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8 flex flex-col gap-1">
      <h2 className="text-[28px] font-semibold tracking-tight text-[#0a0a0a] dark:text-[#fafafa]">{title}</h2>
      {subtitle ? <p className="text-base text-[#64748b] dark:text-[#a1a1aa]">{subtitle}</p> : null}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "danger";

export function EverydayBtn({
  children,
  onClick,
  variant = "secondary",
  className = "",
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const base = "inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-2.5 text-base font-semibold transition-colors";
  const styles: Record<BtnVariant, string> = {
    primary: "border border-transparent bg-[#030213] text-white hover:opacity-90 dark:bg-[#fafafa] dark:text-[#030213]",
    secondary: "border border-[#cbd5e1] bg-white text-[#0a0a0a] hover:bg-[#f8fafc] dark:border-[#3a3a3d] dark:bg-[#2a2a2d] dark:text-[#fafafa]",
    danger: "border border-[#d4183d] bg-white text-[#d4183d] hover:bg-[#fff1f2] dark:bg-[#2a2a2d]",
  };
  return (
    <button type={type} disabled={disabled} className={`${base} ${styles[variant]} ${className}`} onClick={onClick}>
      {children}
    </button>
  );
}

function useMakerLogoUrl(make: string): string | null {
  const q = useQuery({
    queryKey: ["parts-catalog-makers"],
    queryFn: () => api.partsCatalogMakers(),
    staleTime: 300_000,
  });
  const key = make.trim().toLowerCase();
  const row = q.data?.items?.find((m) => m.make.trim().toLowerCase() === key);
  return row?.logoUrl?.trim() ? row.logoUrl : null;
}

export function MakerLogo({ make, size = 48 }: { make: string; size?: number }) {
  const letter = (make || "?").trim().charAt(0).toUpperCase();
  const logoUrl = useMakerLogoUrl(make);
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="shrink-0 rounded-2xl object-cover bg-[#f1f5f9] dark:bg-[#3a3a3d]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-lg font-semibold text-[#0a0a0a] dark:bg-[#3a3a3d] dark:text-[#fafafa]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {letter}
    </div>
  );
}

export function PlateChip({ plate }: { plate: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-[#f1f5f9] px-2.5 py-1 font-mono text-sm font-bold tracking-wider dark:border-white/10 dark:bg-[#3a3a3d]">
      {plate}
    </span>
  );
}

const TRUST_COPY = {
  verified: {
    title: "Verified",
    body: "The car maker's own parts catalogue lists this part for this car.",
  },
  check: {
    title: "Check before buying",
    body: "We found this fit in a parts list, but the car maker hasn't confirmed it for this car yet. Show the store your car's details and ask them to match it before you pay.",
  },
} as const;

export function TrustBadge({
  trust,
  defaultOpen,
}: {
  trust: "verified" | "check";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const ref = useRef<HTMLDivElement>(null);
  const verified = trust === "verified";
  const copy = TRUST_COPY[trust];
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${
          verified
            ? "bg-[#ecfdf5] text-[#059669] dark:bg-[#064e3b] dark:text-[#34d399]"
            : "bg-[#fffbeb] text-[#b45309] dark:bg-[#451a03] dark:text-[#fbbf24]"
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="material-symbols-outlined text-[16px]">{verified ? "verified" : "info"}</span>
        {verified ? "Verified" : "Check before buying"}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-[min(320px,90vw)] rounded-2xl border border-black/10 bg-white p-4 shadow-lg dark:border-[#3a3a3d] dark:bg-[#2a2a2d]">
          <p className="text-base font-semibold text-[#0a0a0a] dark:text-[#fafafa]">{copy.title}</p>
          <p className="mt-2 text-sm text-[#64748b] dark:text-[#a1a1aa]">{copy.body}</p>
          <div className="mt-4">
            <EverydayBtn variant="primary" onClick={() => setOpen(false)} className="w-full">
              Got it
            </EverydayBtn>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function mapTrustLabel(raw: string): "verified" | "check" {
  const s = raw.toLowerCase();
  if (s === "confirmed" || s === "verified") return "verified";
  return "check";
}

export function useCopyToast() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(""), 2000);
    return () => window.clearTimeout(t);
  }, [msg]);
  async function copy(text: string, label?: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(label ? `Copied ${label}` : "Copied");
    } catch {
      setMsg("Could not copy");
    }
  }
  const toast = msg ? (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#030213] px-4 py-2 text-sm text-white dark:bg-[#fafafa] dark:text-[#030213]">
      {msg}
    </div>
  ) : null;
  return { copy, toast };
}

export function PartNumberBlock({
  number,
  onCopy,
  fullWidth,
}: {
  number: string;
  onCopy: () => void;
  fullWidth?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4 dark:border-[#3a3a3d] dark:bg-[#1c1c1e]">
      <p className="text-sm text-[#64748b]">Give the store this number</p>
      <p className="mt-1 font-mono text-[22px] tracking-wide text-[#0a0a0a] dark:text-[#fafafa]">{number}</p>
      <EverydayBtn variant="primary" className={`mt-4 ${fullWidth ? "w-full" : ""}`} onClick={onCopy}>
        Copy number
      </EverydayBtn>
    </div>
  );
}

export type CarWheelHighlight =
  | "front"
  | "rear"
  | "all"
  | "none"
  | "front-left"
  | "front-right"
  | "rear-left"
  | "rear-right";

export function CarTopDownMini({ highlight }: { highlight?: CarWheelHighlight }) {
  const wheelLit = (which: "front-left" | "front-right" | "rear-left" | "rear-right") => {
    if (highlight === "all") return true;
    if (highlight === "none" || !highlight) return false;
    if (highlight === "front") return which.startsWith("front-");
    if (highlight === "rear") return which.startsWith("rear-");
    return highlight === which;
  };
  const stroke = "#64748b";
  const activeStroke = "#030213";
  const activeFill = "rgba(3, 2, 19, 0.22)";
  const idleStroke = "#cbd5e1";
  const idleFill = "transparent";
  const wheel = (which: "front-left" | "front-right" | "rear-left" | "rear-right") => {
    const on = wheelLit(which);
    return { fill: on ? activeFill : idleFill, stroke: on ? activeStroke : idleStroke, strokeWidth: 2 };
  };
  const positions: Record<"front-left" | "front-right" | "rear-left" | "rear-right", { cx: number; cy: number }> = {
    "front-left": { cx: 22, cy: 36 },
    "front-right": { cx: 58, cy: 36 },
    "rear-left": { cx: 22, cy: 104 },
    "rear-right": { cx: 58, cy: 104 },
  };
  return (
    <svg viewBox="0 0 80 140" className="h-28 w-16 shrink-0" aria-hidden>
      <rect x="18" y="20" width="44" height="100" rx="12" fill="none" stroke={stroke} strokeWidth="2" />
      {(["front-left", "front-right", "rear-left", "rear-right"] as const).map((which) => {
        const { cx, cy } = positions[which];
        const w = wheel(which);
        return <ellipse key={which} cx={cx} cy={cy} rx={8} ry={6} {...w} />;
      })}
    </svg>
  );
}
