import { useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { kitColumns, numField, strField, type KitCell } from '../../inventoryData';
import { downloadBlob } from '../../inventoryDownload';
import { FUEL_CARDS_PATH, goToFleetPath, TOLL_TAGS_PATH } from '../../inventoryNav';
import { useInScreenBase } from './useInShared';

export function useIn6VehicleKitsForm() {
  const base = useInScreenBase();
  const { shell, submit, live } = base;
  const [view, setView] = useState<'matrix' | 'cards'>('matrix');
  const rows = shell.kitComplianceRows;
  const columns = kitColumns(rows);

  const exportMatrix = () =>
    submit.run(async () => {
      const res = await inventoryApi.kitsComplianceCsv();
      if (res.kind === 'csv') downloadBlob('kit-compliance.csv', new Blob([res.text], { type: 'text/csv' }));
    });

  /** Vehicle kits → Issue missing: every car's missing lines ticked, no confirm step. */
  const issueAllMissing = () => shell.openIssue({ allMissing: true });
  /** One car → Issue missing. */
  const issueMissingForCar = (vehicleId: string) => {
    const v = live.kitVehicles.find((x) => x.vehicleId === vehicleId);
    shell.openIssue({
      vehicleId,
      kitLineIds: (v?.cells ?? []).filter((c) => c.required && c.status !== 'ok' && c.itemId).map((c) => c.kitLineId),
    });
  };
  /** A red Missing / Short cell (IV-09). Fuel card / toll tag lines open their own page. */
  const openCell = (cell: KitCell) => {
    if (cell.lineType === 'linked_fuel_card') return goToFleetPath(FUEL_CARDS_PATH);
    if (cell.lineType === 'linked_toll_tag') return goToFleetPath(TOLL_TAGS_PATH);
    shell.openIssue({ vehicleId: cell.vehicleId, kitLineIds: [cell.kitLineId] });
  };

  /** Report → that car's kit card in a dialog. */
  const openKitCard = (vehicleId: string) => shell.openGap('kit-card', { vehicleId });
  const openKitEditor = () => shell.openModal('kit-editor');
  const openCentralStore = () => shell.setTab('stock');

  /** Balances at the car's location that are not kit lines ("Also on this car"). */
  const alsoOnCar = (vehicleId: string): string[] => {
    const kitItems = new Set(columns.map((c) => c.itemId).filter(Boolean));
    const code = `veh-${vehicleId}`.toLowerCase();
    return shell.stockRows
      .filter((r) => strField(r, 'location_code', '').toLowerCase() === code)
      .filter((r) => numField(r, 'on_hand', 0) > 0 && !kitItems.has(strField(r, 'item_id', '')))
      .map((r) => `${strField(r, 'name', 'Item')} × ${numField(r, 'on_hand', 0)}`);
  };

  return {
    ...base,
    shell,
    submit,
    live,
    rows,
    columns,
    view,
    setView,
    exportMatrix,
    issueAllMissing,
    issueMissingForCar,
    openCell,
    openKitCard,
    openKitEditor,
    openCentralStore,
    alsoOnCar,
    strField,
  };
}
