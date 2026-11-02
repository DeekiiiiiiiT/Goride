import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

function statusLabel(raw: unknown): string {
  const s = String(raw ?? 'open').toLowerCase();
  if (s.includes('reject')) return 'Rejected';
  if (s.includes('issue')) return 'Issued';
  if (s.includes('approve')) return 'Approved';
  if (s.includes('pending') || s.includes('approval')) return 'Needs approval';
  return 'Open';
}

export function useGapRequisitionForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [reqs, stock] = await Promise.all([inventoryApi.requisitions(), inventoryApi.stock()]);
    return {
      requisitions: asPagedItems(reqs as { items?: unknown[] }),
      stock: asPagedItems(stock as { items?: unknown[] }),
    };
  }, []);

  const [note, setNote] = useState('');
  const [forVehicleId, setForVehicleId] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [selectedReqId, setSelectedReqId] = useState('');

  const requisitions = load.data?.requisitions ?? [];

  useEffect(() => {
    if (selectedReqId || !requisitions.length) return;
    setSelectedReqId(String(requisitions[0].id));
  }, [requisitions, selectedReqId]);

  const selectedReq = useMemo(
    () => requisitions.find((r) => String(r.id) === selectedReqId) ?? null,
    [requisitions, selectedReqId],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: requisitions.length, open: 0, approved: 0, issued: 0, rejected: 0 };
    for (const row of requisitions) {
      const label = statusLabel(row.status).toLowerCase();
      if (label.includes('reject')) counts.rejected += 1;
      else if (label.includes('issue')) counts.issued += 1;
      else if (label.includes('approve')) counts.approved += 1;
      else counts.open += 1;
    }
    return counts;
  }, [requisitions]);

  const canSubmit = Boolean(forVehicleId.trim());

  const pipelineTotalLabel = formatJmd(
    Number(
      requisitions.reduce((sum, row) => sum + Number(row.estimated_total_jmd ?? row.total_jmd ?? 0), 0),
    ) || null,
  );

  const selectedReqTotalLabel = formatJmd(
    Number(selectedReq?.estimated_total_jmd ?? selectedReq?.total_jmd ?? 0) || null,
  );

  const vehicleTargetLabel = forVehicleId.trim() || String(selectedReq?.vehicle_plate ?? '—');
  const newFormCodeLabel = selectedReq?.number != null ? String(selectedReq.number) : 'New draft';

  const submitReq = () =>
    submit.run(async () => {
      if (!canSubmit) throw new Error('Choose a vehicle or recipient');
      await inventoryApi.createRequisition({
        note: note.trim() || null,
        for_vehicle_id: forVehicleId.trim(),
        needed_by: neededBy.trim() || null,
      });
      await load.reload();
      await shell.refresh();
      onClose?.();
    });

  const reqIdForAction = () => {
    const id = selectedReqId || (selectedReq?.id ? String(selectedReq.id) : '');
    if (!id) throw new Error('Select a requisition');
    return id;
  };

  const approve = () =>
    submit.run(async () => {
      await inventoryApi.approveRequisition(reqIdForAction());
      await load.reload();
      await shell.refresh();
    });

  const reject = () =>
    submit.run(async () => {
      await inventoryApi.rejectRequisition(reqIdForAction());
      await load.reload();
      await shell.refresh();
    });

  const issue = () =>
    submit.run(async () => {
      await inventoryApi.issueRequisition(reqIdForAction());
      await load.reload();
      await shell.refresh();
      onClose?.();
    });

  return {
    load,
    submit,
    note,
    setNote,
    forVehicleId,
    setForVehicleId,
    neededBy,
    setNeededBy,
    requisitions,
    selectedReqId,
    setSelectedReqId,
    selectedReq,
    statusCounts,
    canSubmit,
    submitReq,
    approve,
    reject,
    issue,
    statusLabel,
    pipelineTotalLabel,
    selectedReqTotalLabel,
    vehicleTargetLabel,
    newFormCodeLabel,
    formatJmd,
  };
}
