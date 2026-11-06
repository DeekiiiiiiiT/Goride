import { useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { downloadInventoryExportCsv } from '../inventoryDownload';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

function parseMoney(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function useGapRegisterAssetForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [items, locationsPayload] = await Promise.all([
      inventoryApi.items(),
      inventoryApi.locationsBins(),
    ]);
    return {
      items: asPagedItems(items as { items?: unknown[] }),
      locations: (locationsPayload as { locations?: Record<string, unknown>[] }).locations ?? [],
    };
  }, []);

  const serialItems = useMemo(
    () =>
      (load.data?.items ?? []).filter((row) =>
        Boolean(row.is_serial_tracked ?? row.serial_tracked ?? row.track_serial),
      ),
    [load.data?.items],
  );

  const [itemId, setItemId] = useState('');
  const [assetTag, setAssetTag] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [locationId, setLocationId] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [nextInspectionDue, setNextInspectionDue] = useState('');

  const selectedItem = serialItems.find((it) => String(it.id) === itemId) ?? null;
  const selectedLocation =
    (load.data?.locations ?? []).find((l) => String(l.id) === locationId) ?? null;

  const purchaseCostLabel = formatJmd(parseMoney(purchaseCost));
  const ledgerImpactLabel = purchaseCostLabel;
  const assignVehicleLabel = selectedLocation
    ? `${String(selectedLocation.code ?? '—')} · ${String(selectedLocation.name ?? '—')}`
    : '—';
  const previewAssetTag = assetTag.trim() || '—';
  const previewItemName = selectedItem ? String(selectedItem.name ?? '—') : '—';

  const canRegister = Boolean(itemId) && serialNumber.trim().length > 0;

  const register = () =>
    submit.run(async () => {
      if (!canRegister) throw new Error('Select an item and enter a serial number');
      await inventoryApi.registerAsset({
        item_id: itemId,
        asset_tag: assetTag.trim() || undefined,
        serial_number: serialNumber.trim(),
        location_id: locationId.trim() || null,
        purchase_cost: parseMoney(purchaseCost),
        next_inspection_due: nextInspectionDue.trim() || null,
      });
      await shell.refresh();
      onClose?.();
    });

  const exportLedger = () => void downloadInventoryExportCsv();

  const scrollToRegisterForm = () => {
    document.getElementById('register-asset-form-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return {
    load,
    submit,
    serialItems,
    locations: load.data?.locations ?? [],
    serialItemCount: serialItems.length,
    itemId,
    setItemId,
    assetTag,
    setAssetTag,
    serialNumber,
    setSerialNumber,
    locationId,
    setLocationId,
    purchaseCost,
    setPurchaseCost,
    nextInspectionDue,
    setNextInspectionDue,
    canRegister,
    register,
    selectedItem,
    selectedLocation,
    purchaseCostLabel,
    ledgerImpactLabel,
    assignVehicleLabel,
    previewAssetTag,
    previewItemName,
    formatJmd,
    exportLedger,
    scrollToRegisterForm,
    cancel: () => onClose?.(),
  };
}
