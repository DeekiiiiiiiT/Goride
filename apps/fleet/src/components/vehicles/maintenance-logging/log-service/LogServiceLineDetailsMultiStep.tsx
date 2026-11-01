import React from "react";
import { Check } from "lucide-react";
import { LOG_SERVICE_COPY } from "./logServiceCopy";

export function LogServiceLineDetailsMultiStep({
  packageLabel,
  componentCount,
  baySessionLabel,
  configuredCount,
  subtotalLabel,
  mechanicNote,
  workOrderRef,
  onMechanicNoteChange,
  onWorkOrderRefChange,
  children,
}: {
  packageLabel?: string | null;
  componentCount: number;
  baySessionLabel: string;
  configuredCount: number;
  subtotalLabel: string;
  mechanicNote: string;
  workOrderRef: string;
  onMechanicNoteChange: (v: string) => void;
  onWorkOrderRefChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const allConfigured = componentCount > 0 && configuredCount >= componentCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-1">
        <div>
          <span className="text-[11px] text-secondary uppercase tracking-wider font-semibold">
            {LOG_SERVICE_COPY.wizardEyebrow}
          </span>
          <h2 className="text-2xl font-semibold text-on-surface mt-0.5">
            {LOG_SERVICE_COPY.lineDetailsTitle}
            {packageLabel ? ` — ${packageLabel}` : ""}
          </h2>
          <p className="text-sm text-secondary mt-1">{LOG_SERVICE_COPY.lineDetailsSubtitle}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {packageLabel ? (
            <span className="inline-flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg text-sm font-semibold text-on-surface">
              <span className="w-2 h-2 rounded-full bg-primary" />
              {packageLabel} ({componentCount} components)
            </span>
          ) : null}
          <span className="text-xs font-mono text-on-surface-variant bg-surface-container px-2 py-1 rounded">
            {LOG_SERVICE_COPY.baySessionLabel}
            {baySessionLabel}
          </span>
        </div>
      </div>

      <div className="space-y-4">{children}</div>

      <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-on-surface">
          <span className="font-semibold">{configuredCount} lines configured</span>
          {allConfigured ? (
            <span className="text-secondary"> · ALL OEM MATCH CRITERIA CLEARED</span>
          ) : null}
        </div>
        <span className="text-sm font-semibold text-on-surface">{subtotalLabel}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
            Mechanic note
          </label>
          <textarea
            className="w-full min-h-[72px] rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm"
            value={mechanicNote}
            onChange={(e) => onMechanicNoteChange(e.target.value)}
            placeholder="Optional notes for the bay…"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
            Work order reference
          </label>
          <input
            className="w-full h-9 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 text-sm"
            value={workOrderRef}
            onChange={(e) => onWorkOrderRefChange(e.target.value)}
            placeholder="External WO #"
          />
        </div>
      </div>

      {allConfigured ? (
        <p className="text-xs text-secondary flex items-center gap-1">
          <Check className="w-3.5 h-3.5 text-primary" /> All lines saved — continue to review when ready.
        </p>
      ) : null}
    </div>
  );
}
