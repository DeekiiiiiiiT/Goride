import { useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type ApprovalRow = Record<string, unknown>;
type SettingsRow = Record<string, unknown>;

function approvalTypeLabel(row: ApprovalRow | null): string {
  if (!row) return '—';
  const t = String(row.subject_type ?? row.approval_type ?? '—');
  if (t.toLowerCase().includes('write')) return 'Write-off';
  if (t.toLowerCase().includes('adjust')) return 'Adjustment';
  if (t.toLowerCase().includes('count')) return 'Count diff';
  if (t.toLowerCase().includes('po') || t.toLowerCase().includes('purchase')) return 'PO';
  return t;
}

function parseMeta(row: ApprovalRow | null): Record<string, unknown> {
  if (!row) return {};
  const raw = row.metadata ?? row.meta ?? row.details;
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export function useGapApprovalDrawerForm(
  approvalId: string | null | undefined,
  onClose?: () => void,
) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [approvalsPayload, settingsPayload] = await Promise.all([
      inventoryApi.approvals('pending'),
      inventoryApi.settings(),
    ]);
    return {
      items: asPagedItems(approvalsPayload as { items?: unknown[] }) as ApprovalRow[],
      settings: (settingsPayload as { settings?: SettingsRow | null }).settings ?? null,
    };
  }, []);

  const pendingItems = load.data?.items ?? [];
  const settings = load.data?.settings ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(approvalId ?? null);

  const approval = useMemo(() => {
    const id = selectedId ?? approvalId;
    if (id) {
      const found = pendingItems.find((a) => String(a.id) === String(id));
      if (found) return found;
    }
    return pendingItems[0] ?? null;
  }, [approvalId, pendingItems, selectedId]);

  const meta = useMemo(() => parseMeta(approval), [approval]);

  const inspectorName = useMemo(() => {
    if (!approval) return '—';
    const raw =
      approval.inspector_name ??
      approval.inspector ??
      approval.approved_by_name ??
      approval.requested_by_name;
    return raw != null ? String(raw) : '—';
  }, [approval]);

  const memo = useMemo(() => {
    if (!approval) return '';
    const raw = approval.memo ?? approval.note ?? approval.request_memo ?? approval.description;
    return raw != null ? String(raw) : '';
  }, [approval]);

  const headline = useMemo(() => {
    if (!approval) return '—';
    const name =
      meta.item_name ??
      meta.asset_name ??
      approval.item_name ??
      approval.rule_name ??
      approval.subject_type;
    const tag = meta.asset_tag ?? approval.asset_tag ?? approval.rule_code;
    const parts = [name != null ? String(name) : null, tag != null ? String(tag) : null].filter(
      Boolean,
    );
    return parts.length ? parts.join(' ') : '—';
  }, [approval, meta]);

  const assetTag = useMemo(
    () => String(meta.asset_tag ?? approval?.asset_tag ?? approval?.rule_code ?? '—'),
    [approval, meta],
  );

  const vehicleLabel = useMemo(() => {
    const plate = meta.vehicle_plate ?? approval?.vehicle_plate ?? meta.plate;
    const model = meta.vehicle_name ?? approval?.vehicle_name ?? meta.vehicle_label;
    if (plate && model) return `${plate} · ${model}`;
    if (plate) return String(plate);
    if (model) return String(model);
    return '—';
  }, [approval, meta]);

  const impactAmountLabel = formatJmd(Number(approval?.amount) || null);

  const varianceSummary = useMemo(() => {
    const lines = meta.variance_lines ?? meta.lines ?? approval?.variance_lines;
    if (Array.isArray(lines) && lines.length) {
      return lines
        .map((line) => {
          const row = line as Record<string, unknown>;
          const label = String(row.name ?? row.item_name ?? row.sku ?? 'Line');
          const delta = Number(row.qty_delta ?? row.delta ?? row.diff ?? 0);
          const sign = delta >= 0 ? '+' : '−';
          return `${label} ${sign}${Math.abs(delta)}`;
        })
        .join(' · ');
    }
    const note = meta.variance_summary ?? approval?.variance_summary;
    return note != null ? String(note) : '—';
  }, [approval, meta]);

  const varianceAmountLabel = useMemo(() => {
    const raw = meta.variance_amount_jmd ?? meta.variance_total ?? approval?.variance_amount;
    if (raw != null) return formatJmd(Number(raw));
    return formatJmd(Number(approval?.amount) || null);
  }, [approval, meta]);

  const thresholdLabel = useMemo(() => {
    const jmd = settings?.approval_threshold_jmd ?? settings?.write_off_threshold_jmd;
    return formatJmd(jmd != null ? Number(jmd) : null);
  }, [settings]);

  const activeTypeLabel = approvalTypeLabel(approval);

  const [rejectReason, setRejectReason] = useState('');

  const canApprove = Boolean(approval?.id);
  const canReject = Boolean(approval?.id) && rejectReason.trim().length > 0;

  const selectApproval = (id: string) => setSelectedId(id);

  const approve = () =>
    submit.run(async () => {
      const id = approval?.id ? String(approval.id) : null;
      if (!id) throw new Error('Select an approval first');
      await inventoryApi.approveApproval(id);
      await shell.refresh();
      onClose?.();
    });

  const reject = () =>
    submit.run(async () => {
      const id = approval?.id ? String(approval.id) : null;
      if (!id) throw new Error('Select an approval first');
      if (!rejectReason.trim()) throw new Error('Provide a rejection reason');
      await inventoryApi.rejectApproval(id);
      await shell.refresh();
      onClose?.();
    });

  return {
    load,
    submit,
    approval,
    pendingItems,
    pendingCount: pendingItems.length,
    inspectorName,
    memo,
    rejectReason,
    setRejectReason,
    canApprove,
    canReject,
    approve,
    reject,
    selectApproval,
    headline,
    assetTag,
    vehicleLabel,
    impactAmountLabel,
    varianceSummary,
    varianceAmountLabel,
    thresholdLabel,
    activeTypeLabel,
    formatJmd,
  };
}
