import { useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { useInScreenBase } from './useInShared';

export function useIn16SetupForm() {
  const base = useInScreenBase();
  const { shell, submit } = base;
  const [locationName, setLocationName] = useState('');

  const itemCount = shell.items.length;
  const step = itemCount > 0 ? (shell.countSessions.length > 0 ? 3 : 2) : 1;
  const progressPct = Math.round((step / 3) * 100);

  const addLocation = () =>
    submit.run(async () => {
      const name = locationName.trim() || 'Main store';
      await inventoryApi.createLocation({ name, kind: 'warehouse' });
      setLocationName('');
      await shell.refresh();
    });

  const loadStarter = () => shell.openGap('import-items', { itemId: null });
  const startCount = () => shell.openGap('count-session', { countSessionId: null });
  const finishSetup = () => shell.closeModal();

  return {
    ...base,
    shell,
    submit,
    locationName,
    setLocationName,
    itemCount,
    step,
    progressPct,
    addLocation,
    loadStarter,
    startCount,
    finishSetup,
  };
}
