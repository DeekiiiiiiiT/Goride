import { coverageGapMessage, formatCoverDay } from '@roam/finance-core';

type Props = {
  coverageStart: string;
  coverageEnd: string;
  dataStart?: string | null;
  dataEnd?: string | null;
  savedStart?: string | null;
  savedEnd?: string | null;
  onCoverageStart: (value: string) => void;
  onCoverageEnd: (value: string) => void;
};

export function statementCoverageError(input: {
  coverageStart: string;
  coverageEnd: string;
  savedStart?: string | null;
  savedEnd?: string | null;
}): string | null {
  return coverageGapMessage({
    coverageStart: input.coverageStart || null,
    coverageEnd: input.coverageEnd || null,
    dataStart: input.savedStart || null,
    dataEnd: input.savedEnd || null,
  });
}

/** Editable “this file covers” range. Empty days inside it count as no activity. */
export function StatementCoverageFields({
  coverageStart,
  coverageEnd,
  dataStart,
  dataEnd,
  savedStart,
  savedEnd,
  onCoverageStart,
  onCoverageEnd,
}: Props) {
  const error = statementCoverageError({
    coverageStart,
    coverageEnd,
    savedStart,
    savedEnd,
  });
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
    </div>
  );
}
