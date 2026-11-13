import React from 'react';
import { AlertTriangle, UploadCloud } from 'lucide-react';
import type { ReconRunSource } from '../../../../../services/reconApi';
import { Button } from '../../../../ui/button';
import { TollV2SecondaryButton } from '../TollV2Buttons';
import type { TollV2ImportReport } from './tollV2ImportTypes';
import {
  countProblems,
  importRowStatusLabel,
  problemRows,
  reportForSource,
  resultLineForKind,
} from './tollV2ImportReportFormat';
import type { TollV2ImportReportRow } from './tollV2ImportTypes';

const TOLL_SOURCE_IDS = new Set(['toll_usage', 'toll_topup', 'uber_bundle']);

export function ReconTollV2SourceEnhancement({
  source,
  reports,
  uberTollError,
  onReplace,
  onSeeRead,
  onFixDriver,
  onWhichCar,
  onRetryUberToll,
  onUploadAgain,
  fixedKeys,
  readProblems = [],
}: {
  source: ReconRunSource;
  reports: TollV2ImportReport[];
  uberTollError?: string | null;
  onReplace: () => void;
  onSeeRead: (report: TollV2ImportReport) => void;
  onFixDriver: (row: TollV2ImportReportRow) => void;
  onWhichCar: (row: TollV2ImportReportRow) => void;
  onRetryUberToll?: () => void;
  onUploadAgain?: () => void;
  fixedKeys: ReadonlySet<string>;
  /** The latest upload's reader problems (unknown driver / car), which are never saved. */
  readProblems?: TollV2ImportReportRow[];
}) {
  if (!TOLL_SOURCE_IDS.has(source.id)) return null;

  const report = reportForSource(reports, source.id);
  const resultLine = resultLineForKind(
    source.id === 'toll_usage' ? 'tag_statement' : source.id === 'toll_topup' ? 'topups' : 'uber',
    report,
  );
  const problems = [...problemRows(report), ...readProblems].filter((r) => !fixedKeys.has(problemKey(r)));
  const problemCount = countProblems(report) + readProblems.length;

  const showResult = source.status === 'received' || report || readProblems.length > 0;
  const showFixed = fixedKeys.size > 0 && Boolean(onUploadAgain);
  if (!uberTollError && !showResult && problems.length === 0 && !showFixed) return null;

  return (
    <div className="mt-3 space-y-3 border-t border-[#e5eeff] pt-3">
      {uberTollError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-900">
          <p>{uberTollError}</p>
          {onRetryUberToll ? (
            <Button type="button" size="sm" className="mt-2" variant="default" onClick={onRetryUberToll}>
              Try the toll import again
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* P3-R4: a received file always offers "Replace file", even when no toll rows were saved
          (e.g. every row needed a fix), so the person can upload it again after fixing. */}
      {showResult ? (
        <div className="rounded-xl border border-[#e5eeff] bg-[#f8f9ff] p-3">
          <p className="text-sm font-medium text-[#0b1c30]">{resultLine ?? 'No toll rows read from the last file yet'}</p>
          {problemCount > 0 ? (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {problemCount} {problemCount === 1 ? 'row' : 'rows'} couldn&apos;t be used
            </span>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {report ? (
              <TollV2SecondaryButton type="button" onClick={() => onSeeRead(report)}>
                See what was read
              </TollV2SecondaryButton>
            ) : null}
            <TollV2SecondaryButton type="button" onClick={onReplace}>
              Replace file
            </TollV2SecondaryButton>
          </div>
        </div>
      ) : null}

      {problems.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {problems.slice(0, 5).map((row, idx) => (
            <li
              key={problemKey(row)}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2"
            >
              <span className="text-[#47464c]">
                Row {row.row ?? idx + 1} · {importRowStatusLabel(row).replace('Problem: ', '')}
              </span>
              <span className="flex gap-2">
                {String(row.reason ?? '').includes('driver') || row.status === 'unknown_driver' ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => onFixDriver(row)}>
                    Fix driver
                  </Button>
                ) : null}
                {String(row.reason ?? '').includes('plate') ||
                String(row.reason ?? '').includes('vehicle') ||
                row.status === 'unknown_plate' ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => onWhichCar(row)}>
                    Which car?
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {fixedKeys.size > 0 && onUploadAgain ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-900">
          <p>Fixed — upload the file again to read these rows</p>
          <Button type="button" size="sm" className="mt-2" onClick={onUploadAgain}>
            <UploadCloud className="mr-1.5 h-4 w-4" />
            Upload the file again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function problemKey(row: TollV2ImportReportRow): string {
  return `${row.row ?? ''}:${row.ref ?? ''}:${row.status ?? ''}`;
}
