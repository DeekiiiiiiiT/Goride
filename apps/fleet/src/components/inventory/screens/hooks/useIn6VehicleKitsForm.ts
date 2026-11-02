import { useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { downloadBlob } from '../../inventoryDownload';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { useInScreenBase } from './useInShared';

export function useIn6VehicleKitsForm() {
  const base = useInScreenBase();
  const { shell, submit, live } = base;
  const [view, setView] = useState<'matrix' | 'cards' | 'cars'>('matrix');
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [confirmPlate, setConfirmPlate] = useState('');
  const [confirmNote, setConfirmNote] = useState('');
  const rows = shell.kitComplianceRows;

  const exportMatrix = () =>
    submit.run(async () => {
      const res = await inventoryApi.kitsComplianceCsv();
      if (res.kind === 'csv') downloadBlob('kit-compliance.csv', new Blob([res.text], { type: 'text/csv' }));
    });

  const issueKits = () => shell.openModal('issue');
  const openKitCard = (vehicleId: string) => {
    shell.setTab('vehicle-kits');
    void vehicleId;
  };

  const issueMissing = (vehicleId: string, itemId: string) =>
    submit.run(async () => {
      await inventoryApi.issue(
        {
          source_location_id: null,
          vehicle_ids: [vehicleId],
          issue_available_only: true,
          lines: [{ item_id: itemId, qty: 1 }],
        },
        newInventoryIdempotencyKey('kit-issue'),
      );
      await shell.refresh();
    });

  const openConfirmIssue = () => setConfirmIssue(true);
  const closeConfirmIssue = () => setConfirmIssue(false);

  const openCentralStore = () => {
    shell.setTab('stock');
  };

  const firstMissingPair = () => {
    const row = rows.find((r) => strField(r, 'status', '').toLowerCase() === 'missing');
    if (!row) return null;
    return {
      vehicleId: strField(row, 'vehicle_id', ''),
      itemId: strField(row, 'item_id', ''),
    };
  };

  return {
    ...base,
    shell,
    submit,
    live,
    rows,
    view,
    setView,
    confirmIssue,
    openConfirmIssue,
    closeConfirmIssue,
    confirmPlate,
    setConfirmPlate,
    confirmNote,
    setConfirmNote,
    exportMatrix,
    issueKits,
    openKitCard,
    issueMissing,
    openCentralStore,
    firstMissingPair,
    strField,
  };
}
