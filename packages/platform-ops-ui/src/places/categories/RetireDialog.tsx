// Stitch: dominion-redesign/categories_retire_dialog_blocked_allowed_states
import { useState } from "react";
import { registerHref, retireDialogShowsButton, retireTitle, type BlockedBy } from "./categoriesFormat";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

export function RetireDialog({
  label,
  table,
  id,
  blocked,
  busy,
  onClose,
  onRetire,
}: {
  label: string;
  table: string;
  id: string;
  blocked: BlockedBy;
  busy: boolean;
  onClose: () => void;
  onRetire: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const allowed = retireDialogShowsButton(blocked);
  const title = label === "Gas station" ? "Retire Gas station?" : label === "Beach" ? "Retire Beach?" : retireTitle(label);
  const places = Number(blocked.places || 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-surface-dim/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-xl">
        <div className="flex items-center justify-between bg-surface-container-lowest px-6 py-5">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${allowed ? "bg-error/10 text-error" : "bg-error-container/20 text-error"}`}>
              <Icon name={allowed ? "archive" : "block"} className="text-[20px]" />
            </div>
            <div>
              <span className={`font-label text-[10px] font-bold uppercase tracking-widest ${allowed ? "text-tertiary" : "text-outline"}`}>
                {allowed ? "State B · Clearance Verified" : "State A · Dependency Block"}
              </span>
              <h3 className="font-headline text-base font-semibold text-on-surface">{title}</h3>
            </div>
          </div>
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-outline hover:bg-surface-container-low" onClick={onClose}>
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
        <div className="flex flex-col gap-5 p-6">
          {!allowed && (
            <div className="flex items-start gap-3 rounded-xl bg-surface-container-low p-4 text-xs text-on-surface">
              <Icon name="info" className="mt-0.5 shrink-0 text-[18px] text-outline" />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-on-surface">Active Reference Lockout</span>
                <span className="leading-relaxed text-on-surface-variant">You can't retire this while it's in use. Remove dependencies from all parish networks before retiring.</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between px-1 font-label text-[11px] font-bold uppercase tracking-wider text-outline">
            <span>{allowed ? "Binding Verification" : "System Dependency"}</span>
            <span>{allowed ? "Audit Status" : "Binding Count"}</span>
          </div>
          {allowed ? (
            <div className="grid grid-cols-2 gap-2.5">
              <ClearRow label="Places using it" />
              <ClearRow label="Plug home chip" />
              <ClearRow label="Types searching as this" />
              <ClearRow label="Children" />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <ImpactRow icon="pin_drop" title="Places using it" detail={places > 0 && table === "place_type" ? "Open in register" : undefined} href={places > 0 && table === "place_type" ? registerHref(id) : undefined} count={places} danger={places > 0} />
              <ImpactRow icon="cell_tower" title="Plug home chip" detail={blocked.plug_chip ? "Plug shows this chip today" : undefined} count={blocked.plug_chip ? 1 : 0} danger={false} />
              <ImpactRow icon="manage_search" title="Types searching as this" detail="Search query fallbacks" count={Number(blocked.search_as || 0)} danger={false} />
              <ImpactRow icon="account_tree" title="Children" detail="Sub-category nodes" count={Number(blocked.children || 0) + Number(blocked.facilities || 0) + Number(blocked.default_facilities || 0)} danger={false} />
            </div>
          )}
          {allowed && (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-headline text-xs font-semibold text-on-surface" htmlFor="retire-reason">Reason *</label>
                  <span className="font-mono text-[10px] text-outline">{reason.length} / 10 min</span>
                </div>
                <textarea
                  id="retire-reason"
                  rows={3}
                  className="w-full resize-none rounded-xl bg-surface-container-low p-3 font-body text-xs text-on-surface outline-none placeholder:text-outline focus:bg-surface-container"
                  placeholder="Explain why this place type is being retired from the master registry..."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <span className="px-1 text-[11px] text-outline">Kept in History. At least 10 characters.</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-surface-container-high/60 p-3.5 text-xs text-on-surface">
                <Icon name="published_with_changes" className="shrink-0 text-[18px] text-secondary" />
                <p className="text-[11px] leading-relaxed text-on-surface-variant">
                  Plug stops showing it right away. You can restore it from <span className="font-semibold text-on-surface">Retired</span>.
                </p>
              </div>
            </>
          )}
        </div>
        <div className={`flex items-center bg-surface-container-low px-6 py-4 ${allowed ? "justify-between" : "justify-end"}`}>
          {allowed ? (
            <button type="button" className="rounded-lg px-5 py-2.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container" onClick={onClose}>Cancel</button>
          ) : (
            <button type="button" className="rounded-lg bg-surface-container px-5 py-2.5 text-xs font-semibold text-on-surface shadow-sm hover:bg-surface-container-high" onClick={onClose}>Close</button>
          )}
          {allowed && (
            <button
              type="button"
              disabled={busy || reason.trim().length < 10}
              className="flex items-center gap-1.5 rounded-lg bg-[#b91c1c] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              onClick={() => onRetire(reason.trim())}
            >
              <Icon name="archive" className="text-[16px]" />
              Retire
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ClearRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-3">
      <span className="text-xs font-medium text-on-surface">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-xs font-semibold text-on-surface-variant">0</span>
        <Icon name="check_circle" className="text-[16px] text-tertiary" />
      </span>
    </div>
  );
}

function ImpactRow({
  icon,
  title,
  detail,
  href,
  count,
  danger,
}: {
  icon: string;
  title: string;
  detail?: string;
  href?: string;
  count: number;
  danger: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-3.5 hover:bg-surface-container">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-highest text-on-surface-variant">
          <Icon name={icon} className="text-[18px]" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-on-surface">{title}</span>
          {href ? (
            <a className="mt-0.5 flex items-center gap-0.5 text-[11px] font-medium text-secondary hover:underline" href={href}>{detail}<Icon name="chevron_right" className="text-[12px]" /></a>
          ) : detail ? (
            <span className="text-[11px] text-on-surface-variant">{detail}</span>
          ) : null}
        </div>
      </div>
      <span className={`rounded px-2 py-0.5 font-mono text-sm font-bold ${danger ? "bg-error-container/20 text-error" : "bg-surface-container-highest text-on-surface"}`}>{count}</span>
    </div>
  );
}
