import React from "react";
import { Plus, ReceiptText } from "lucide-react";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import type { LogServiceOemMatchSummary } from "./logServiceOemMatchSummary";
import { LS, LT } from "./logServiceStitch";

/**
 * Step 3 "Details" — Stitch docs/stitch/powertrain-job-fit-fleet/html/06: intro line + "Step 3 of 4",
 * one card per job, "Subtotal summary" strip. The visit note is not in the step 3 design; Review has
 * the Notes box, so it is entered there.
 */
export function LogServiceLineDetailsMultiStep({
  packageLabel,
  componentCount,
  configuredCount,
  subtotalLabel,
  oemMatch,
  onAddAnotherJob,
  addAnotherDisabledReason,
  banner,
  children,
}: {
  /** Under the intro line (inspection findings: "From inspection on …" when opened from Log it now). */
  banner?: React.ReactNode;
  packageLabel?: string | null;
  componentCount: number;
  /** No longer shown (invented code); kept so callers don't change. */
  baySessionLabel?: string;
  configuredCount: number;
  subtotalLabel: string;
  /** Kept so callers don't change; the note is entered on Review. */
  mechanicNote: string;
  onMechanicNoteChange: (v: string) => void;
  homeBase?: string | null;
  oemMatch?: LogServiceOemMatchSummary | null;
  onAddAnotherJob?: () => void;
  addAnotherDisabledReason?: string | null;
  children: React.ReactNode;
}) {
  const match = oemMatch ?? { replaceLineCount: 0, missingVerifiedCount: 0, cleared: true };
  const showOemSuffix = match.replaceLineCount > 0 && !match.cleared;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className={`${LT.bodyMd} ${LS.muted}`}>
          Enter part details, costs and labour for each job{packageLabel ? ` in ${packageLabel}` : ""}{" "}
          <span className={`font-semibold ${LS.text}`}>
            ({componentCount} job{componentCount === 1 ? "" : "s"})
          </span>
          .
        </p>
        <span className={`hidden sm:block uppercase tracking-wider ${LT.labelSm} ${LS.muted}`}>Step 3 of 4</span>
      </div>

      {banner ?? null}

      <div className="flex flex-col gap-4">{children}</div>

      {onAddAnotherJob ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            data-testid="log-service-details-add-another-job"
            disabled={!!addAnotherDisabledReason}
            onClick={onAddAnotherJob}
            className={`w-full min-h-12 rounded-xl border-2 border-dashed border-[#c9c5cd] dark:border-[#57545c] flex items-center justify-center gap-2 ${LT.titleSm} ${LS.text} transition-colors hover:bg-[#eeedf7] dark:hover:bg-[#23242e] disabled:opacity-60 disabled:pointer-events-none disabled:hover:bg-transparent`}
          >
            <Plus className="w-4 h-4" />
            {LOG_SERVICE_COPY.addAnotherJob}
          </button>
          {addAnotherDisabledReason ? (
            <p className={`text-center ${LT.bodySm} ${LS.muted}`}>{addAnotherDisabledReason}</p>
          ) : null}
        </div>
      ) : null}

      <div className={`p-4 rounded-xl flex items-center justify-between gap-3 ${LS.low}`} data-testid="line-details-subtotal">
        <div className={`flex flex-wrap items-center gap-2 ${LS.muted}`}>
          <ReceiptText className="w-5 h-5" />
          <span className={LT.bodyMd}>Subtotal summary</span>
          {showOemSuffix ? (
            <span className={`${LT.labelSm} text-[#c76c00]`}>
              · {LOG_SERVICE_COPY.linesWithoutVerifiedPartSuffix(match.missingVerifiedCount)}
            </span>
          ) : null}
        </div>
        <div className="text-right">
          <span className={`${LT.titleMd} ${LS.text} tabular-nums`}>{subtotalLabel}</span>
          <span className={`${LT.bodySm} ${LS.muted} ml-1`}>
            ({configuredCount} item{configuredCount === 1 ? "" : "s"})
          </span>
        </div>
      </div>
    </div>
  );
}
