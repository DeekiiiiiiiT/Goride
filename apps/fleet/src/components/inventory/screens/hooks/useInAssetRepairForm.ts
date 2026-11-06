import { useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { parseMoneyInput, useInScreenBase } from './useInShared';
import { strField } from '../../inventoryData';

export function useInAssetRepairForm() {
  const base = useInScreenBase();
  const { shell, submit, finishSuccess, formatJmd } = base;
  const assetId = shell.selectedAssetId ?? '';

  const asset = useMemo(
    () => shell.assets.find((a) => strField(a, 'id', '') === assetId) ?? null,
    [shell.assets, assetId],
  );

  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [photoPath, setPhotoPath] = useState('');

  const canSubmit = Boolean(assetId && description.trim());

  const submitRepair = () =>
    submit.run(async () => {
      if (!canSubmit) throw new Error('Description is required');
      const parsedCost = parseMoneyInput(cost);
      await inventoryApi.assetRepair(assetId, {
        note: description.trim(),
        description: description.trim(),
        cost_jmd: parsedCost > 0 ? parsedCost : null,
        photo_path: photoPath.trim() || null,
        set_status: 'installed',
      });
      await finishSuccess();
    });

  return {
    ...base,
    shell,
    asset,
    assetId,
    assetLabel: asset ? strField(asset, 'name', 'Asset') : '—',
    description,
    setDescription,
    cost,
    setCost,
    photoPath,
    setPhotoPath,
    canSubmit,
    submitRepair,
    formatJmd,
  };
}
