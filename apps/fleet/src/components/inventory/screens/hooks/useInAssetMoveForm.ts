import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { useInScreenBase } from './useInShared';

export function useInAssetMoveForm() {
  const base = useInScreenBase();
  const { shell, live, submit, finishSuccess } = base;
  const assetId = shell.selectedAssetId ?? '';

  const asset = useMemo(
    () => shell.assets.find((a) => strField(a, 'id', '') === assetId) ?? null,
    [shell.assets, assetId],
  );

  const [vehicleId, setVehicleId] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (vehicleId) return;
    const first = live.kitVehicles[0]?.vehicleId;
    if (first) setVehicleId(String(first));
  }, [live.kitVehicles, vehicleId]);

  const vehicleOptions = live.kitVehicles;

  const canSubmit = Boolean(assetId && vehicleId);

  const submitMove = () =>
    submit.run(async () => {
      if (!canSubmit) throw new Error('Choose a destination vehicle');
      await inventoryApi.assetMove(
        assetId,
        {
          vehicle_id: vehicleId,
          to_vehicle_id: vehicleId,
          note: note.trim() || null,
        },
        newInventoryIdempotencyKey('asset-move'),
      );
      await finishSuccess();
    });

  return {
    ...base,
    shell,
    asset,
    assetId,
    assetLabel: asset ? strField(asset, 'name', strField(asset, 'serial_number', 'Asset')) : '—',
    vehicleId,
    setVehicleId,
    vehicleOptions,
    note,
    setNote,
    canSubmit,
    submitMove,
  };
}
