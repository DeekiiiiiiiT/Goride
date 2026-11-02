import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

export type RequisitionStatusFilter = 'all' | 'open' | 'approved' | 'issued' | 'rejected';
export type RequisitionTargetKind = 'vehicle' | 'staff';

export type RequisitionDraftLine = {
  key: string;
  itemId: string;
  name: string;
  sku: string;
  qty: number;
  unitJmd: number;
};

const PAGE_SIZE = 8;

function statusLabel(raw: unknown): string {
  const s = String(raw ?? 'open').toLowerCase();
  if (s.includes('reject')) return 'Rejected';
  if (s.includes('issue')) return 'Issued';
  if (s.includes('approve')) return 'Approved';
  if (s.includes('pending') || s.includes('approval')) return 'Needs approval';
  return 'Open';
}

function statusBucket(raw: unknown): RequisitionStatusFilter {
  const label = statusLabel(raw).toLowerCase();
  if (label.includes('reject')) return 'rejected';
  if (label.includes('issue')) return 'issued';
  if (label.includes('approve')) return 'approved';
  return 'open';
}

function lineFromStock(row: Record<string, unknown>): RequisitionDraftLine {
  const itemId = String(row.id ?? row.item_id ?? '');
  const unitJmd = Number(row.unit_cost_jmd ?? row.default_cost_jmd ?? 0);
  return {
    key: itemId || crypto.randomUUID(),
    itemId,
    name: String(row.name ?? '—'),
    sku: String(row.sku ?? '—'),
    qty: 1,
    unitJmd: Number.isFinite(unitJmd) ? unitJmd : 0,
  };
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
  const [forStaffId, setForStaffId] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [selectedReqId, setSelectedReqId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RequisitionStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [targetKind, setTargetKind] = useState<RequisitionTargetKind>('vehicle');
  const [page, setPage] = useState(0);
  const [draftLines, setDraftLines] = useState<RequisitionDraftLine[]>([]);

  const requisitions = load.data?.requisitions ?? [];
  const stock = load.data?.stock ?? [];

  useEffect(() => {
    if (selectedReqId || !requisitions.length) return;
    setSelectedReqId(String(requisitions[0].id));
  }, [requisitions, selectedReqId]);

  useEffect(() => {
    if (draftLines.length || !stock.length) return;
    setDraftLines(stock.slice(0, 2).map((row) => lineFromStock(row)));
  }, [draftLines.length, stock]);

  const selectedReq = useMemo(
    () => requisitions.find((r) => String(r.id) === selectedReqId) ?? null,
    [requisitions, selectedReqId],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: requisitions.length,
      open: 0,
      approved: 0,
      issued: 0,
      rejected: 0,
    };
    for (const row of requisitions) {
      const bucket = statusBucket(row.status);
      if (bucket !== 'all') counts[bucket] += 1;
    }
    return counts;
  }, [requisitions]);

  const filteredRequisitions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requisitions.filter((row) => {
      if (statusFilter !== 'all' && statusBucket(row.status) !== statusFilter) return false;
      if (!q) return true;
      const ref = String(row.ref_no ?? row.number ?? row.id ?? '').toLowerCase();
      const vehicle = String(row.for_vehicle_id ?? row.vehicle_plate ?? '').toLowerCase();
      const noteText = String(row.note ?? '').toLowerCase();
      return ref.includes(q) || vehicle.includes(q) || noteText.includes(q);
    });
  }, [requisitions, searchQuery, statusFilter]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, searchQuery]);

  const pageCount = Math.max(1, Math.ceil(filteredRequisitions.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRequisitions = filteredRequisitions.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const canSubmit =
    targetKind === 'vehicle'
      ? Boolean(forVehicleId.trim()) && draftLines.length > 0
      : Boolean(forStaffId.trim()) && draftLines.length > 0;

  const draftTotalLabel = formatJmd(
    draftLines.reduce((sum, line) => sum + line.qty * line.unitJmd, 0) || null,
  );

  const pipelineTotalLabel = formatJmd(
    Number(
      requisitions.reduce((sum, row) => sum + Number(row.estimated_total_jmd ?? row.total_jmd ?? 0), 0),
    ) || null,
  );

  const selectedReqTotalLabel = formatJmd(
    Number(selectedReq?.estimated_total_jmd ?? selectedReq?.total_jmd ?? 0) || null,
  );

  const vehicleTargetLabel =
    targetKind === 'vehicle'
      ? forVehicleId.trim() || String(selectedReq?.vehicle_plate ?? '—')
      : forStaffId.trim() || '—';
  const newFormCodeLabel = 'New draft';

  const openCreate = () => setCreateOpen(true);
  const closeCreate = () => setCreateOpen(false);

  const addDraftLine = () => {
    const used = new Set(draftLines.map((l) => l.itemId));
    const next = stock.find((row) => !used.has(String(row.id)));
    if (!next) return;
    setDraftLines((prev) => [...prev, lineFromStock(next)]);
  };

  const removeDraftLine = (key: string) => {
    setDraftLines((prev) => prev.filter((l) => l.key !== key));
  };

  const setDraftLineQty = (key: string, qty: number) => {
    const safe = Number.isFinite(qty) && qty > 0 ? qty : 1;
    setDraftLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: safe } : l)));
  };

  const submitReq = () =>
    submit.run(async () => {
      if (!canSubmit) throw new Error('Choose a recipient and at least one item');
      const targetId = targetKind === 'vehicle' ? forVehicleId.trim() : forStaffId.trim();
      await inventoryApi.createRequisition({
        note: note.trim() || null,
        for_vehicle_id: targetKind === 'vehicle' ? targetId : null,
        for_user_id: targetKind === 'staff' ? targetId : null,
        needed_by: neededBy.trim() || null,
        lines: draftLines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
      });
      setNote('');
      setForVehicleId('');
      setForStaffId('');
      setNeededBy('');
      setDraftLines(stock.slice(0, 2).map((row) => lineFromStock(row)));
      setCreateOpen(false);
      await load.reload();
      await shell.refresh();
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

  const paginationLabel = `Showing ${pagedRequisitions.length} of ${filteredRequisitions.length} requests`;
  const filterLabel = searchQuery.trim() ? searchQuery.trim() : statusFilter === 'all' ? 'None' : statusFilter;

  return {
    load,
    submit,
    note,
    setNote,
    forVehicleId,
    setForVehicleId,
    forStaffId,
    setForStaffId,
    neededBy,
    setNeededBy,
    requisitions,
    pagedRequisitions,
    filteredRequisitions,
    selectedReqId,
    setSelectedReqId,
    selectedReq,
    statusCounts,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    createOpen,
    openCreate,
    closeCreate,
    targetKind,
    setTargetKind,
    page: safePage,
    pageCount,
    setPage,
    canNextPage: safePage < pageCount - 1,
    canPrevPage: safePage > 0,
    nextPage: () => setPage((p) => Math.min(p + 1, pageCount - 1)),
    prevPage: () => setPage((p) => Math.max(p - 1, 0)),
    paginationLabel,
    filterLabel,
    draftLines,
    addDraftLine,
    removeDraftLine,
    setDraftLineQty,
    draftTotalLabel,
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
