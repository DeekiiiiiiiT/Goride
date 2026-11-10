import { useEffect, useMemo, useRef, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { downloadInventoryExportCsv } from '../inventoryDownload';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';
import { useGapModalSteps } from './useGapModalSteps';

type Row = Record<string, unknown>;

export type ReorderRuleRow = {
  location_id: string;
  location_name: string;
  reorder_at: string;
  order_qty: string;
  safety_stock: string;
};

function parseMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function useGapItemEditorForm(itemId: string | null | undefined, onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [itemsPayload, locationsPayload] = await Promise.all([
      inventoryApi.items(),
      inventoryApi.locationsBins(),
    ]);
    const catalog = asPagedItems(itemsPayload as { items?: unknown[] });
    let item: Row | null = null;
    if (itemId) {
      const data = await inventoryApi.item(itemId);
      item = ((data as { item?: Row }).item ?? data) as Row;
    }
    const locations = (locationsPayload as { locations?: Row[] }).locations ?? [];
    return { item, catalog, locations };
  }, [itemId]);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [modelSpec, setModelSpec] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [tracking, setTracking] = useState<'quantity' | 'serial'>('quantity');
  const [unitOfMeasure, setUnitOfMeasure] = useState('each');
  const [reorderRules, setReorderRules] = useState<ReorderRuleRow[]>([]);
  const [inspectionIntervalDays, setInspectionIntervalDays] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState('');
  const [catalogLinkLabel, setCatalogLinkLabel] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const archiveSteps = useGapModalSteps();

  useEffect(() => {
    const row = load.data?.item;
    if (!row) {
      if (!itemId) {
        setName('');
        setSku('');
        setDescription('');
        setModelSpec('');
        setUnitCost('');
        setTracking('quantity');
        setUnitOfMeasure('each');
        setReorderRules([]);
        setInspectionIntervalDays('');
        setWarrantyMonths('');
      }
      return;
    }
    setName(String(row.name ?? ''));
    setSku(String(row.sku ?? ''));
    setDescription(String(row.description ?? ''));
    setModelSpec(String(row.model ?? row.specification ?? ''));
    const cost = row.default_unit_cost;
    setUnitCost(cost != null ? String(cost) : '');
    const track = String(row.tracking ?? row.tracking_mode ?? 'quantity');
    setTracking(track === 'serial' ? 'serial' : 'quantity');
    setUnitOfMeasure(String(row.uom ?? 'each'));
    setInspectionIntervalDays(
      row.inspection_interval_days != null ? String(row.inspection_interval_days) : '',
    );
    setWarrantyMonths(row.warranty_months != null ? String(row.warranty_months) : '');
    const rulesRaw = Array.isArray(row.reorder_rules) ? row.reorder_rules : [];
    if (rulesRaw.length) {
      setReorderRules(
        rulesRaw.map((r: Row) => ({
          location_id: String(r.location_id ?? ''),
          location_name: String(r.location_name ?? r.name ?? '—'),
          reorder_at: String(r.reorder_at ?? r.min_qty ?? ''),
          order_qty: String(r.order_qty ?? r.reorder_qty ?? ''),
          safety_stock: String(r.safety_stock ?? ''),
        })),
      );
    } else if (load.data?.locations?.length) {
      setReorderRules(
        load.data.locations.slice(0, 2).map((loc) => ({
          location_id: String(loc.id),
          location_name: String(loc.name ?? '—'),
          reorder_at: '',
          order_qty: '',
          safety_stock: '',
        })),
      );
    }
  }, [load.data?.item, load.data?.locations, itemId]);

  const catalog = load.data?.catalog ?? [];
  const isNew = !itemId;

  const canSave = name.trim().length > 0 && (isNew ? sku.trim().length > 0 : true);

  const buildBody = () => {
    const cost = parseMoney(unitCost);
    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      tracking,
      model: modelSpec.trim() || null,
      // Real inv_item columns only (IV-16: no warranty / reorder / vendor fields).
      uom: unitOfMeasure,
      inspection_interval_days:
        inspectionIntervalDays.trim() === ''
          ? null
          : Number.parseInt(inspectionIntervalDays, 10),
    };
    if (cost != null) body.default_unit_cost = cost;
    if (isNew) body.sku = sku.trim();
    else body.sku = sku.trim() || null;
    return body;
  };

  const save = () =>
    submit.run(async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Item name is required');
      const body = buildBody();
      if (itemId) {
        await inventoryApi.patchItem(itemId, body);
      } else {
        if (!sku.trim()) throw new Error('SKU is required for new items');
        await inventoryApi.createItem(body, crypto.randomUUID());
      }
      await shell.refresh();
      onClose?.();
    });

  const archive = () =>
    submit.run(async () => {
      if (!itemId) throw new Error('Nothing to archive');
      await inventoryApi.deleteItem(itemId);
      await shell.refresh();
      onClose?.();
    });

  const setReorderField = (
    locationId: string,
    field: keyof Omit<ReorderRuleRow, 'location_id' | 'location_name'>,
    value: string,
  ) => {
    setReorderRules((prev) =>
      prev.map((r) => (r.location_id === locationId ? { ...r, [field]: value } : r)),
    );
  };

  const addReorderRule = () => {
    const loc = load.data?.locations?.find(
      (l) => !reorderRules.some((r) => r.location_id === String(l.id)),
    );
    if (!loc) return;
    setReorderRules((prev) => [
      ...prev,
      {
        location_id: String(loc.id),
        location_name: String(loc.name ?? '—'),
        reorder_at: '',
        order_qty: '',
        safety_stock: '',
      },
    ]);
  };

  const unlinkCatalog = () => setCatalogLinkLabel(null);

  const exportCsv = () => void downloadInventoryExportCsv();

  const openNewItem = () => {
    shell.setSelectedItemId(null);
    shell.openGap('item-editor');
  };

  const openPhotoPicker = () => photoInputRef.current?.click();

  const onPhotoSelected = (file: File | null) => {
    if (!file || !itemId) return;
    submit.run(async () => {
      const path = `inventory/items/${itemId}/${file.name}`;
      await inventoryApi.patchItem(itemId, { photo_paths: [path] });
      await load.reload();
    });
  };

  const confirmArchive = () =>
    submit.run(async () => {
      if (!itemId) throw new Error('Nothing to archive');
      await inventoryApi.deleteItem(itemId);
      await shell.refresh();
      archiveSteps.closeConfirm();
      onClose?.();
    });

  const reorderDisplay = useMemo(() => reorderRules, [reorderRules]);

  const assetIdentifierLabel = useMemo(() => {
    const row = load.data?.item;
    if (row?.asset_tag != null) return String(row.asset_tag);
    if (row?.identifier != null) return String(row.identifier);
    if (sku.trim()) return sku.trim();
    return '—';
  }, [load.data?.item, sku]);

  const stockValuePreviewLabel = formatJmd(parseMoney(unitCost));

  return {
    load,
    submit,
    isNew,
    name,
    setName,
    sku,
    setSku,
    description,
    setDescription,
    modelSpec,
    setModelSpec,
    unitCost,
    setUnitCost,
    tracking,
    setTracking,
    unitOfMeasure,
    setUnitOfMeasure,
    reorderRules: reorderDisplay,
    setReorderField,
    inspectionIntervalDays,
    setInspectionIntervalDays,
    warrantyMonths,
    setWarrantyMonths,
    catalog,
    canSave,
    formatJmd,
    save,
    archive,
    exportCsv,
    openNewItem,
    addReorderRule,
    unlinkCatalog,
    catalogLinkLabel,
    openPhotoPicker,
    onPhotoSelected,
    photoInputRef,
    archiveSteps,
    confirmArchive,
    assetIdentifierLabel,
    stockValuePreviewLabel,
  };
}
