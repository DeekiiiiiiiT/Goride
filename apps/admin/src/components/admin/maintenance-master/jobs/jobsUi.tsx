/** Shared buttons + chips for the Jobs screens (S43a–S43d). Every action is a real button. */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { partIconKey } from "../MmChips";
import { JOB_ACTION_LABEL, type JobAction } from "./jobsApi";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; children?: ReactNode };

const base =
  "inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export function OutlineButton({ icon, children, className = "", ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`${base} border border-outline-variant/60 bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container ${className}`}
      {...rest}
    >
      {icon ? <span className="material-symbols-outlined text-[16px]">{icon}</span> : null}
      {children}
    </button>
  );
}

export function DangerButton({ icon, children, className = "", ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`${base} border border-error/60 bg-surface-container-lowest text-error hover:bg-error/10 ${className}`}
      {...rest}
    >
      {icon ? <span className="material-symbols-outlined text-[16px]">{icon}</span> : null}
      {children}
    </button>
  );
}

export function DangerSolidButton({ icon, children, className = "", ...rest }: BtnProps) {
  return (
    <button type="button" className={`${base} bg-error text-white hover:opacity-90 ${className}`} {...rest}>
      {icon ? <span className="material-symbols-outlined text-[16px]">{icon}</span> : null}
      {children}
    </button>
  );
}

export function PrimaryButton({ icon, children, className = "", ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`${base} bg-secondary px-4 py-2 font-semibold text-white shadow-sm hover:opacity-90 ${className}`}
      {...rest}
    >
      {icon ? <span className="material-symbols-outlined text-[16px]">{icon}</span> : null}
      {children}
    </button>
  );
}

/** Square icon-only button with a visible border (move up/down, collapse, close). */
export function IconButton({ icon, className = "", ...rest }: BtnProps & { icon: string; "aria-label": string }) {
  return (
    <button
      type="button"
      title={rest["aria-label"]}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-on-surface hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  );
}

export function JobIcon({ iconKey, className = "" }: { iconKey?: string | null; className?: string }) {
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eeedf6] text-[#0153dc] ${className}`}
    >
      <span className="material-symbols-outlined text-[18px]">{partIconKey(iconKey)}</span>
    </div>
  );
}

const chip = "inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium";

export function FormTypeChip({ isPart }: { isPart: boolean }) {
  return isPart ? (
    <span className={`${chip} border border-[#0153dc]/40 bg-white text-[#0153dc]`}>
      <span className="material-symbols-outlined text-[13px]">settings</span>Part
    </span>
  ) : (
    <span className={`${chip} bg-[#eeedf6] text-[#5d5f68]`}>
      <span className="material-symbols-outlined text-[13px]">build</span>Service
    </span>
  );
}

export function ActionChip({ action }: { action: JobAction }) {
  return <span className={`${chip} bg-[#eeedf6] text-[#5d5f68]`}>{JOB_ACTION_LABEL[action] ?? action}</span>;
}

export function ListedFromChip({ groupName }: { groupName: string }) {
  return (
    <span className={`${chip} bg-[#dbe1ff] text-[#0047c0]`}>
      <span className="material-symbols-outlined text-[13px]">link</span>Listed from {groupName}
    </span>
  );
}

export function StatusChip({ status }: { status: "active" | "retired" }) {
  return status === "active" ? (
    <span className={`${chip} bg-[#dcfce7] text-[#166534]`}>
      <span className="h-1.5 w-1.5 rounded-full bg-[#15803d]" />
      Active
    </span>
  ) : (
    <span className={`${chip} bg-[#eeedf6] text-[#5d5f68]`}>
      <span className="material-symbols-outlined text-[13px]">inventory_2</span>Retired
    </span>
  );
}

export function CountChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-[#eeedf6] px-1.5 py-0.5 font-code text-[11px] text-[#5d5f68]">{children}</span>
  );
}

/** Small in-app modal frame (no browser pop-ups). */
export function Modal({
  labelledBy,
  onClose,
  children,
  width = "max-w-md",
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`mm-light-card w-full ${width} rounded-2xl border border-outline-variant/40 bg-white p-6 shadow-lg`}
      >
        {children}
      </div>
    </div>
  );
}
