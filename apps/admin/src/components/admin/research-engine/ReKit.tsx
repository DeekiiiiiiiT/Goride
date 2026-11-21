/**
 * Research engine screens — shared look (docs/stitch/research-engine/, "Dominion Roam Console").
 * Exact hex colours only (Dominion dark-mode remap). Buttons follow the owner's rule: primary solid blue, secondary
 * bordered, danger red border + red text, final confirm solid red. In-app overlays only, never browser pop-ups.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DIcon } from "../parts-database/add-parts/catalog/dominionKit";
import { PartsButton } from "../parts-database/PartsButton";
import type { PillTone, StatePill } from "./researchModel";
import "../parts-database/partsDatabase.css";

export { D_CARD, D_MONO, D_MUTED, D_TXT, DIcon, PartsButton };

/** Page background: Dominion's main area stays light grey in dark mode, so these pages paint their own. */
export const RE_PAGE = "min-h-full bg-[#faf8fe] text-[#30323b] dark:bg-[#0b1220] dark:text-[#e2e8f0]";
export const RE_SOFT = "bg-[#f3f3ff] dark:bg-[#0b1220]";
export const RE_LABEL = `text-[13px] font-medium uppercase tracking-wider ${D_MUTED}`;

const PILL_TONES: Record<PillTone, string> = {
  green: "bg-[#e6f4ea] text-[#006e31] dark:bg-[#14532d]/60 dark:text-[#4ade80]",
  "green-outline": "border border-[#006e31] text-[#006e31] dark:border-[#4ade80] dark:text-[#4ade80]",
  amber: "bg-[#fff4dc] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]",
  blue: "bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]",
  grey: "bg-[#f1f5f9] text-[#475569] dark:bg-[#1e293b] dark:text-[#94a3b8]",
  "grey-outline": "border border-[#c5c6d0] text-[#5d5f68] dark:border-[#334155] dark:text-[#94a3b8]",
  red: "bg-[#fdecec] text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]",
};

export function RePill({ tone, icon, pulse, children, testId }: { tone: PillTone; icon?: string; pulse?: boolean; children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium ${PILL_TONES[tone]}`}
    >
      {pulse ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0153dc] dark:bg-[#93b4ff]" /> : null}
      {icon ? <DIcon name={icon} className="text-[13px]" /> : null}
      {children}
    </span>
  );
}

export function ReStatePill({ pill, testId }: { pill: StatePill; testId?: string }) {
  return (
    <RePill tone={pill.tone} icon={pill.icon} pulse={pill.pulse} testId={testId}>
      {pill.label}
    </RePill>
  );
}

/** Mono data chip (part numbers, frame codes). */
export function ReCode({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded bg-[#ededf9] px-2 py-1 text-[13px] ${strong ? "font-semibold" : "font-medium"} ${D_MONO} ${D_TXT} dark:bg-[#1e293b]`}
    >
      {children}
    </span>
  );
}

/** 560px right drawer over a blurred page; full-screen sheet on a phone (Screen 18). Sticky footer. */
export function ReDrawer({
  open,
  onClose,
  header,
  footer,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid={testId}>
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#191b24]/25 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal
        className="relative flex h-full w-full flex-col overflow-hidden bg-[#f3f3ff] shadow-2xl md:w-[560px] dark:bg-[#0b1220]"
      >
        <div className="z-10 flex items-start justify-between gap-4 bg-white px-6 py-4 shadow-sm dark:bg-[#111a2e]">
          <div className="min-w-0 flex-1">{header}</div>
          <button
            type="button"
            aria-label="Close drawer"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#c5c6d0] bg-white text-[#5d5f68] hover:bg-[#ededf9] dark:border-[#334155] dark:bg-[#111a2e] dark:text-[#94a3b8]"
          >
            <DIcon name="close" className="text-[18px]" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">{children}</div>
        {footer ? (
          <div className="z-10 flex flex-wrap items-center justify-between gap-2 bg-white px-6 py-4 shadow-[0_-4px_16px_rgba(1,83,220,0.04)] dark:bg-[#111a2e]">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function ReSection({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className={RE_LABEL}>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Inline "Saved page text · Hide" panel (Screen 2 / 4). The text is the block the engine kept, verbatim. */
export function ReSavedText({ title, text, onHide }: { title: string; text: string; onHide: () => void }) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl p-4 ${RE_SOFT}`} data-testid="saved-page-text">
      <div className="flex items-center justify-between">
        <span className={`text-[12px] font-medium ${D_TXT}`}>{title}</span>
        <PartsButton variant="secondary" className="!min-h-[28px] !px-2.5" onClick={onHide}>
          Hide
        </PartsButton>
      </div>
      <p className={`whitespace-pre-wrap break-words text-[13px] leading-relaxed ${D_MONO} ${D_MUTED}`}>{text}</p>
    </div>
  );
}

/** Green "Added … Undo" toast (Screen 1 / 17 card 4). */
export function ReToast({ children, onUndo, onClose }: { children: ReactNode; onUndo?: () => void; onClose: () => void }) {
  return (
    <div
      role="status"
      className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-[#e6f4ea] px-4 py-3 text-[#30323b] shadow-sm dark:bg-[#14532d]/60 dark:text-[#e2e8f0]"
      data-testid="research-toast"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#006e31] text-white">
          <DIcon name="check" className="text-[16px]" />
        </span>
        <span className="truncate text-[13px]">{children}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onUndo ? (
          <PartsButton variant="danger" className="!min-h-[30px]" onClick={onUndo}>
            Undo
          </PartsButton>
        ) : null}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#c5c6d0] text-[#5d5f68] dark:border-[#334155] dark:text-[#94a3b8]"
        >
          <DIcon name="close" className="text-[16px]" />
        </button>
      </div>
    </div>
  );
}

/** In-app reason dialog (Screen 17 card 5): text box + "Keep it" / solid red "Reject". */
export function ReReasonDialog({
  open,
  title = "Why isn't this right?",
  busy,
  onCancel,
  onReject,
}: {
  open: boolean;
  title?: string;
  busy?: boolean;
  onCancel: () => void;
  onReject: (reason: string) => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) {
      setText("");
      window.setTimeout(() => ref.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#191b24]/40 p-4" role="dialog" aria-modal data-testid="reject-dialog">
      <div className={`${D_CARD} flex w-full max-w-md flex-col gap-3 p-5 shadow-xl`}>
        <h2 className={`text-[16px] font-semibold ${D_TXT}`}>{title}</h2>
        <textarea
          ref={ref}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say what is wrong"
          className="w-full resize-none rounded-lg border border-[#c5c6d0] bg-white p-2.5 text-[14px] text-[#30323b] outline-none focus:ring-2 focus:ring-[#0153dc] dark:border-[#334155] dark:bg-[#0b1220] dark:text-[#e2e8f0]"
        />
        <div className="flex justify-end gap-2 pt-2">
          <PartsButton variant="secondary" onClick={onCancel} disabled={busy}>
            Keep it
          </PartsButton>
          <PartsButton variant="danger" confirm disabled={busy || !text.trim()} onClick={() => onReject(text.trim())}>
            Reject
          </PartsButton>
        </div>
      </div>
    </div>
  );
}

/** Skeleton rows (Screen 17 card 1). */
export function ReSkeleton({ rows = 3, testId = "research-loading" }: { rows?: number; testId?: string }) {
  return (
    <div className={`${D_CARD} flex flex-col gap-3 p-4`} data-testid={testId} aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`flex flex-col gap-2 rounded-lg p-3 ${RE_SOFT} ${i === rows - 1 ? "opacity-60" : ""}`}>
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 animate-pulse rounded bg-[#e1e1ed] dark:bg-[#1e293b]" />
            <div className="h-4 w-16 animate-pulse rounded-full bg-[#e1e1ed] dark:bg-[#1e293b]" />
          </div>
          <div className="h-3 w-40 animate-pulse rounded bg-[#e1e1ed] dark:bg-[#1e293b]" />
        </div>
      ))}
    </div>
  );
}

/** "Couldn't load …" + Try again (Screen 17 card 2). */
export function ReError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className={`${D_CARD} flex flex-col items-center p-8 text-center`} data-testid="research-error">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fdecec] text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]">
        <DIcon name="cloud_off" className="text-[26px]" />
      </div>
      <h2 className={`text-[16px] font-semibold ${D_TXT}`}>{title}</h2>
      <p className={`mt-1 text-[13px] ${D_MUTED}`}>{message}</p>
      <PartsButton variant="secondary" className="mt-4" onClick={onRetry}>
        <DIcon name="refresh" className="text-[16px]" /> Try again
      </PartsButton>
    </div>
  );
}

/** "Research is paused" + the notice's reason + Resume (Screen 17 card 3). */
export function RePaused({ reason, busy, onResume }: { reason: string | null; busy?: boolean; onResume: () => void }) {
  return (
    <div className={`${D_CARD} flex flex-col items-center p-6 text-center`} data-testid="research-paused">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1f5f9] text-[#475569] dark:bg-[#1e293b] dark:text-[#94a3b8]">
        <DIcon name="pause_circle" className="text-[24px]" />
      </div>
      <h2 className={`text-[16px] font-semibold ${D_TXT}`}>Research is paused</h2>
      {reason ? <p className={`mt-1 text-[13px] ${D_MUTED}`}>{reason}</p> : null}
      <PartsButton variant="primary" className="mt-4" disabled={busy} onClick={onResume}>
        <DIcon name="play_arrow" className="text-[16px]" /> Resume
      </PartsButton>
    </div>
  );
}

/** "Google's daily search limit reached — paused until 00:05 UTC". The reason is the engine's own plain sentence. */
export function pauseReasonText(reason: string | null | undefined, resumeAt?: string | null): string | null {
  const until = resumeAt
    ? `paused until ${new Date(resumeAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`
    : "";
  const r = (reason ?? "").trim();
  if (!r) return until ? until.charAt(0).toUpperCase() + until.slice(1) : null;
  return until ? `${r} — ${until}` : r;
}
