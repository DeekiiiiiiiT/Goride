/**
 * Settlement preview step — extracted from wizard shell (Wave B).
 */
import { Button } from '../../ui/button';
import { FuelSettlementTable, type FuelSettlementRow } from './FuelSettlementTable';

export function FuelSettlementPreviewStep({
  rows,
  onExport,
}: {
  rows: FuelSettlementRow[];
  onExport?: () => void;
}) {
  return (
    <div className="space-y-4">
      {onExport && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" className="min-h-11" onClick={onExport}>
            Export CSV
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-10 text-center text-sm text-slate-500">
          No spend this week.
        </p>
      ) : (
        <FuelSettlementTable rows={rows} />
      )}
    </div>
  );
}
