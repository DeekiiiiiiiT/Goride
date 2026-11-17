import { formatJMD } from '../../../../utils/formatJMD';
import { carriedBalanceWeekChangeCopy } from '../../../../utils/carriedBalanceRepairCopy';
import { Button } from '../../../ui/button';

export type CarriedBalancePreview = {
  lines: Array<{ sourceWeek: string; amount: number; sentence: string }>;
  drift: Array<unknown>;
  currentLandingSettlement?: number | null;
  expectedLandingSettlement?: number | null;
  reason?: string;
};

export function CarriedBalanceRepairBox({
  driverName,
  preview,
  busy,
  applyError,
  onApply,
}: {
  driverName: string;
  preview: CarriedBalancePreview;
  busy: boolean;
  applyError: string | null;
  onApply: () => void;
}) {
  const hasWork = preview.lines.length > 0 || preview.drift.length > 0;
  if (!hasWork) return null;

  const blocked = Boolean(preview.reason?.trim());
  const changeLine =
    preview.currentLandingSettlement != null && preview.expectedLandingSettlement != null
      ? carriedBalanceWeekChangeCopy(
          driverName,
          preview.currentLandingSettlement,
          preview.expectedLandingSettlement,
        )
      : null;

  return (
    <div className="mb-2 space-y-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
      <p>Some old weeks were moved to the week of 19 Oct without the rest of their balance.</p>
      {preview.lines.length > 0 ? (
        <ul className="list-none space-y-1.5">
          {preview.lines.map((line) => (
            <li key={line.sourceWeek} className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">
              <span>{line.sentence}</span>
              <span className="shrink-0 tabular-nums font-medium">{formatJMD(line.amount, 2)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {preview.drift.length > 0 ? (
        <p>Closed weeks put back to their signed amount: {preview.drift.length}</p>
      ) : null}
      {changeLine ? <p>{changeLine}</p> : null}
      {preview.reason ? <p className="font-medium">{preview.reason}</p> : null}
      {applyError ? <p className="text-red-900">{applyError}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          className="h-11"
          disabled={busy || blocked}
          onClick={() => onApply()}
        >
          {busy ? 'Moving…' : 'Move the rest onto 19 Oct'}
        </Button>
      </div>
    </div>
  );
}