import { useInventoryShell } from '../InventoryShellContext';
import { useInventoryLive } from '../inventoryLive';
import { formatJmd } from '../inventoryFormat';
import { useGapSubmit } from '../gap/useGapSubmit';

export function useInScreenBase(onClose?: () => void) {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const submit = useGapSubmit();

  const finishSuccess = async () => {
    await shell.refresh();
    await shell.refreshTab();
    if (onClose) onClose();
    else shell.closeModal();
  };

  const close = () => {
    if (onClose) onClose();
    else shell.closeModal();
  };

  return {
    shell,
    live,
    submit,
    finishSuccess,
    close,
    formatJmd,
  };
}

export type Row = Record<string, unknown>;

export function parseMoneyInput(raw: string): number {
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}
