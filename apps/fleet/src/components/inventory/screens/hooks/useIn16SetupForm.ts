import { useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { useGapLoad } from '../../gap/useGapLoad';
import { useInScreenBase, type Row } from './useInShared';

/** Suggested starter items (shown as chips; the count comes from this list). */
export const STARTER_ITEMS = [
  'Spare tyre',
  'Car jack',
  'Lug wrench',
  'Tyre pump',
  'Phone holder',
  'First-aid kit',
  'Warning triangle',
  'Dash camera',
  'Fire extinguisher',
];

export function useIn16SetupForm() {
  const base = useInScreenBase();
  const { shell, live, submit } = base;
  const [locationName, setLocationName] = useState('');
  const load = useGapLoad(async () => {
    const res = await inventoryApi.locationsBins();
    return { locations: (res as { locations?: Row[] }).locations ?? [] };
  }, []);

  const stores = (load.data?.locations ?? []).filter((l) => String(l.kind ?? '') === 'warehouse');
  const itemCount = shell.items.length || new Set(shell.stockRows.map((r) => String(r.item_id ?? ''))).size;
  const carsOnKit = live.kitVehicles.length;
  /** Real steps done out of 3: a store, items, cars on a kit. */
  const stepsDone = (stores.length > 0 ? 1 : 0) + (itemCount > 0 ? 1 : 0) + (carsOnKit > 0 ? 1 : 0);

  const addLocation = () =>
    submit.run(async () => {
      const name = locationName.trim() || 'Main store';
      await inventoryApi.createLocation({ name, kind: 'warehouse' });
      setLocationName('');
      await load.reload();
      await shell.refresh();
    });

  const loadStarter = () => shell.openGap('import-items', { itemId: null });
  const finishSetup = () => shell.closeModal();

  return {
    ...base,
    shell,
    submit,
    load,
    stores,
    locationName,
    setLocationName,
    itemCount,
    carsOnKit,
    stepsDone,
    addLocation,
    loadStarter,
    finishSetup,
  };
}
