import { useInventoryShell } from './InventoryShellContext';
import {
  GapDriverReportUpdate,
  GapImportItems,
  GapInventorySettings,
  GapItemEditor,
  GapKitCompare,
  GapLocationsBins,
  GapOpeningBalances,
  GapRegisterAsset,
  GapSnoozeSettings,
} from './gap';

export function InventoryGapModals() {
  const shell = useInventoryShell();
  const close = () => shell.closeModal();

  return (
    <>
      {shell.modal === 'inventory-settings' ? <GapInventorySettings onClose={close} /> : null}
      {shell.modal === 'opening-balances' ? <GapOpeningBalances onClose={close} /> : null}
      {shell.modal === 'item-editor' ? (
        <GapItemEditor itemId={shell.selectedItemId} onClose={close} />
      ) : null}
      {shell.modal === 'import-items' ? <GapImportItems onClose={close} /> : null}
      {shell.modal === 'locations-bins' ? <GapLocationsBins onClose={close} /> : null}
      {shell.modal === 'register-asset' ? <GapRegisterAsset onClose={close} /> : null}
      {shell.modal === 'snooze-settings' ? <GapSnoozeSettings onClose={close} /> : null}
      {shell.modal === 'kit-compare' ? <GapKitCompare onClose={close} /> : null}
      {shell.modal === 'driver-report-update' ? (
        <GapDriverReportUpdate reportId={shell.selectedReportId} onClose={close} />
      ) : null}
    </>
  );
}
