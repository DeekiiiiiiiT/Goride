import { useEffect, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';
import { useInventoryShell } from '../InventoryShellContext';

type SettingsRow = Record<string, unknown>;
type CategoryRow = Record<string, unknown>;

/** Inventory settings: driver phone + safety notice, and item categories (IV-16 removed the rest). */
export function useGapInventorySettingsForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [settingsPayload, categoriesPayload] = await Promise.all([
      inventoryApi.settings(),
      inventoryApi.categories(),
    ]);
    return {
      settings: (settingsPayload as { settings?: SettingsRow | null }).settings ?? null,
      categories: (categoriesPayload as { items?: CategoryRow[] }).items ?? [],
    };
  }, []);

  const settings = load.data?.settings ?? null;
  const categories = load.data?.categories ?? [];
  const categoryCount = categories.length;
  const updatedAt = settings?.updated_at ? String(settings.updated_at) : null;

  const [fleetPhone, setFleetPhone] = useState('');
  const [safetyNotice, setSafetyNotice] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (!settings) return;
    setFleetPhone(String(settings.fleet_support_phone ?? ''));
    setSafetyNotice(String(settings.safety_notice_text ?? ''));
  }, [settings]);

  const toggleCategory = (id: string, active: boolean) =>
    submit.run(async () => {
      await inventoryApi.patchCategory(id, { archive: !active });
      await load.reload();
      await shell.refresh();
    });

  const createCategory = () =>
    submit.run(async () => {
      const name = newCategoryName.trim();
      if (!name) throw new Error('Enter a category name');
      await inventoryApi.createCategory({ name });
      setNewCategoryName('');
      await load.reload();
      await shell.refresh();
    });

  const moveCategory = (id: string, direction: 'up' | 'down') =>
    submit.run(async () => {
      const sorted = [...categories].sort(
        (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
      );
      const idx = sorted.findIndex((c) => String(c.id) === id);
      if (idx < 0) return;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[swapIdx];
      await inventoryApi.patchCategory(String(a.id), { sort_order: Number(b.sort_order ?? swapIdx) });
      await inventoryApi.patchCategory(String(b.id), { sort_order: Number(a.sort_order ?? idx) });
      await load.reload();
      await shell.refresh();
    });

  const saveGeneral = () =>
    submit.run(async () => {
      await inventoryApi.updateSettings({
        fleet_support_phone: fleetPhone.trim() || null,
        safety_notice_text: safetyNotice.trim() || null,
      });
      await load.reload();
      await shell.refresh();
      onClose?.();
    });

  return {
    load,
    submit,
    categories,
    categoryCount,
    updatedAt,
    fleetPhone,
    setFleetPhone,
    safetyNotice,
    setSafetyNotice,
    canSaveGeneral: !submit.saving,
    toggleCategory,
    saveGeneral,
    newCategoryName,
    setNewCategoryName,
    createCategory,
    moveCategory,
  };
}
