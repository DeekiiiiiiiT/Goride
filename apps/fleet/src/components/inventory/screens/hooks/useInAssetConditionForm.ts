import { useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { useInScreenBase } from './useInShared';

export const ASSET_CONDITION_STATUSES = [
  { value: 'faulty', label: 'Faulty' },
  { value: 'lost', label: 'Lost' },
  { value: 'in_repair', label: 'In repair' },
  { value: 'in_store', label: 'In store' },
  { value: 'installed', label: 'Installed' },
] as const;

export function useInAssetConditionForm() {
  const base = useInScreenBase();
  const { shell, submit, finishSuccess } = base;
  const assetId = shell.selectedAssetId ?? '';

  const asset = useMemo(
    () => shell.assets.find((a) => strField(a, 'id', '') === assetId) ?? null,
    [shell.assets, assetId],
  );

  const [status, setStatus] = useState<string>('faulty');
  const [note, setNote] = useState('');
  const [photoPath, setPhotoPath] = useState('');

  const canSubmit = Boolean(assetId && note.trim());

  const submitCondition = () =>
    submit.run(async () => {
      if (!canSubmit) throw new Error('Note is required');
      await inventoryApi.assetCondition(assetId, {
        status,
        note: note.trim(),
        photo_path: photoPath.trim() || null,
      });
      await finishSuccess();
    });

  return {
    ...base,
    shell,
    asset,
    assetId,
    assetLabel: asset ? strField(asset, 'name', 'Asset') : '—',
    status,
    setStatus,
    note,
    setNote,
    photoPath,
    setPhotoPath,
    canSubmit,
    submitCondition,
  };
}
