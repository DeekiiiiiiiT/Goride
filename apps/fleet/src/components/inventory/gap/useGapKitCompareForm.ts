import { useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { formatJmd } from '../inventoryFormat';
import { downloadText } from '../inventoryDownload';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

export type KitCompareRow = {
  key: string;
  name: string;
  sku: string;
  leftQty: string;
  rightQty: string;
  changeStatus: 'unchanged' | 'changed' | 'added' | 'removed';
  impactNote: string;
};

function rowFromRecord(raw: Record<string, unknown>, changeStatus: KitCompareRow['changeStatus']): KitCompareRow {
  const name = String(raw.name ?? raw.item_name ?? raw.label ?? 'Kit line');
  const sku = String(raw.sku ?? raw.code ?? raw.item_code ?? '—');
  const leftQty = raw.left_qty != null ? String(raw.left_qty) : raw.qty_left != null ? String(raw.qty_left) : '—';
  const rightQty = raw.right_qty != null ? String(raw.right_qty) : raw.qty_right != null ? String(raw.qty_right) : '—';
  return {
    key: String(raw.id ?? raw.item_id ?? `${sku}-${changeStatus}`),
    name,
    sku,
    leftQty,
    rightQty,
    changeStatus,
    impactNote: String(raw.note ?? raw.impact ?? '—'),
  };
}

function normalizeComparePayload(data: unknown): KitCompareRow[] {
  if (!data || typeof data !== 'object') return [];
  const payload = data as {
    added?: Record<string, unknown>[];
    removed?: Record<string, unknown>[];
    changed?: Record<string, unknown>[];
    unchanged?: Record<string, unknown>[];
    items?: Record<string, unknown>[];
  };
  if (Array.isArray(payload.items) && payload.items.length) {
    return payload.items.map((row) =>
      rowFromRecord(row, (row.change_status as KitCompareRow['changeStatus']) ?? 'unchanged'),
    );
  }
  const rows: KitCompareRow[] = [];
  for (const row of payload.added ?? []) rows.push(rowFromRecord(row, 'added'));
  for (const row of payload.removed ?? []) rows.push(rowFromRecord(row, 'removed'));
  for (const row of payload.changed ?? []) rows.push(rowFromRecord(row, 'changed'));
  for (const row of payload.unchanged ?? []) rows.push(rowFromRecord(row, 'unchanged'));
  return rows;
}

export function useGapKitCompareForm() {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => inventoryApi.kitsCompare(), []);
  const [filter, setFilter] = useState<'all' | 'diff'>('all');

  const templateId = useMemo(() => {
    const data = load.data as Record<string, unknown> | null;
    if (!data) return null;
    const raw = data.template_id ?? data.templateId ?? data.draft_template_id;
    return raw != null ? String(raw) : null;
  }, [load.data]);

  const versionId = useMemo(() => {
    const data = load.data as Record<string, unknown> | null;
    if (!data) return null;
    const raw = data.version_id ?? data.versionId ?? data.draft_version_id;
    return raw != null ? String(raw) : null;
  }, [load.data]);

  const allRows = useMemo(() => normalizeComparePayload(load.data), [load.data]);

  const rows = useMemo(
    () =>
      filter === 'diff'
        ? allRows.filter((r) => r.changeStatus !== 'unchanged')
        : allRows,
    [allRows, filter],
  );

  const diffCount = useMemo(
    () => allRows.filter((r) => r.changeStatus !== 'unchanged').length,
    [allRows],
  );

  const totalCount = allRows.length;
  const unchangedCount = totalCount - diffCount;

  const primaryBarPct = totalCount > 0 ? Math.round((unchangedCount / totalCount) * 100) : 0;
  const secondaryBarPct = totalCount > 0 ? Math.round((diffCount / totalCount) * 100) : 0;

  const leftVersion = (load.data as { leftVersion?: string | null })?.leftVersion ?? '—';
  const rightVersion = (load.data as { rightVersion?: string | null })?.rightVersion ?? '—';

  const canPublish = Boolean(templateId) && diffCount >= 0;

  const publishKitTemplate = () =>
    submit.run(async () => {
      if (!templateId) throw new Error('No kit template loaded');
      await inventoryApi.publishKitTemplate(templateId, {
        version_id: versionId,
        idempotency_key: crypto.randomUUID(),
      });
      await load.reload();
      await shell.refresh();
    });

  const saveInactive = () =>
    submit.run(async () => {
      if (!templateId) throw new Error('No kit template loaded');
      await inventoryApi.publishKitTemplate(templateId, {
        version_id: versionId,
        save_as_inactive: true,
        idempotency_key: crypto.randomUUID(),
      });
      await load.reload();
      await shell.refresh();
    });

  const kitValuationLabel = formatJmd(
    Number((load.data as { valuation_jmd?: number })?.valuation_jmd ?? 0) || null,
  );

  const affectedVehicleCount = Number(
    (load.data as { affected_vehicle_count?: number })?.affected_vehicle_count ?? 0,
  );
  const affectedTemplateLabel = String(
    (load.data as { affected_template_label?: string })?.affected_template_label ??
      (load.data as { template_name?: string })?.template_name ??
      '—',
  );
  const additionalUnitsLabel = String(
    (load.data as { additional_units_required?: number })?.additional_units_required ?? 0,
  );
  const fleetReadinessLabel = `${Number((load.data as { fleet_readiness_pct?: number })?.fleet_readiness_pct ?? 0)}%`;
  const projectedReadinessLabel = `${Number((load.data as { projected_readiness_pct?: number })?.projected_readiness_pct ?? 0)}% Projected`;

  const exportDiffManifest = () => {
    const header = 'sku,name,left_qty,right_qty,change_status\n';
    const body = allRows
      .map((r) => `${r.sku},${r.name},${r.leftQty},${r.rightQty},${r.changeStatus}`)
      .join('\n');
    downloadText('kit-compare-diff.csv', header + body);
  };

  return {
    load,
    submit,
    rows,
    allRows,
    filter,
    setFilter,
    diffCount,
    totalCount,
    primaryBarPct,
    secondaryBarPct,
    templateId,
    leftVersion,
    rightVersion,
    canPublish,
    publishKitTemplate,
    saveInactive,
    kitValuationLabel,
    affectedVehicleCount,
    affectedTemplateLabel,
    additionalUnitsLabel,
    fleetReadinessLabel,
    projectedReadinessLabel,
    exportDiffManifest,
    formatJmd,
  };
}
