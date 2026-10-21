import { coverageGapMessage, coverageWideWarning, formatCoverDay } from '@roam/finance-core';

type CoverageInput = {
  coverageStart: string;
  coverageEnd: string;
  savedStart?: string | null;
  savedEnd?: string | null;
  weekKey?: string | null;
  filePeriodStart?: string | null;
  filePeriodEnd?: string | null;
  allowWide?: boolean;
  sourceLabel?: string | null;
};

type Props = CoverageInput & {
  dataStart?: string | null;
  dataEnd?: string | null;
  onCoverageStart: (value: string) => void;
  onCoverageEnd: (value: string) => void;
};

export function statementCoverageError(input: CoverageInput): string | null {
  return coverageGapMessage({
    coverageStart: input.coverageStart || null,
    coverageEnd: input.coverageEnd || null,
    dataStart: input.savedStart || null,
    dataEnd: input.savedEnd || null,
    weekKey: input.weekKey,
    filePeriodStart: input.filePeriodStart,
    filePeriodEnd: input.filePeriodEnd,
    allowWide: input.allowWide,
  });
}

export function statementCoverageWarning(input: CoverageInput): string | null {
  if (!input.allowWide) return null;
  if (statementCoverageError({ ...input, allowWide: false })) {
    return coverageWideWarning({
      coverageStart: input.coverageStart || null,
      coverageEnd: input.coverageEnd || null,
      dataStart: input.savedStart || null,
      dataEnd: input.savedEnd || null,
      sourceLabel: input.sourceLabel,
    });
  }
  return null;
}

/** Editable “this file covers” range. Empty days inside it count as no activity. */
export function StatementCoverageFields({
  coverageStart,
  coverageEnd,
  dataStart,
  dataEnd,
  savedStart,
  savedEnd,
  weekKey,
  filePeriodStart,
  filePeriodEnd,
  allowWide,
  sourceLabel,
  onCoverageStart,
  onCoverageEnd,
}: Props) {
  const coverageInput = {
    coverageStart,
    coverageEnd,
    savedStart,
    savedEnd,
    weekKey,
    filePeriodStart,
    filePeriodEnd,
    allowWide,
    sourceLabel,
  };
  const error = statementCoverageError(coverageInput);
  const warning = statementCoverageWarning(coverageInput);
  const coverLabel =
    coverageStart && coverageEnd
      ? `${formatCoverDay(coverageStart)} – ${formatCoverDay(coverageEnd)}`
      : '';
  const txLabel =
    dataStart && dataEnd
      ? `${formatCoverDay(dataStart)} to ${formatCoverDay(dataEnd)}`
      : '';

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-xs font-medium text-slate-800">
        This file covers{coverLabel ? ` ${coverLabel}` : ''}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          From
          <input
            type="date"
            value={coverageStart}
            onChange={(e) => onCoverageStart(e.target.value)}
            className="h-11 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          To
          <input
            type="date"
            value={coverageEnd}
            onChange={(e) => onCoverageEnd(e.target.value)}
            className="h-11 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900"
          />
        </label>
      </div>
      {txLabel ? (
        <p className="text-xs text-slate-600">Transactions run from {txLabel}.</p>
      ) : null}
      <p className="text-xs text-slate-500">
        Days in this range with no transactions count as no activity.
      </p>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {!error && warning ? <p className="text-xs text-amber-800">{warning}</p> : null}
    </div>
  );
}
