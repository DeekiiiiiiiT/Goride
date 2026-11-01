import { useInventoryShell } from './InventoryShellContext';
import { useInventoryGapActions } from './gap/useInventoryGapActions';
import {
  GapApprovalDrawer,
  GapCountSession,
  GapDriverReportUpdate,
  GapImportItems,
  GapInventorySettings,
  GapItemEditor,
  GapKitCompare,
  GapLocationsBins,
  GapOpeningBalances,
  GapPurchaseOrder,
  GapRegisterAsset,
  GapRequisition,
  GapScannerPair,
  GapSnoozeSettings,
  GapVendorEditor,
} from './gap';

export function InventoryGapModals() {
  const shell = useInventoryShell();
  useInventoryGapActions(shell.modal);

  const close = () => shell.closeModal();

  return (
    <>
      {shell.modal === 'inventory-settings' ? <GapInventorySettings onClose={close} /> : null}
      {shell.modal === 'opening-balances' ? <GapOpeningBalances onClose={close} /> : null}
      {shell.modal === 'item-editor' ? <GapItemEditor onClose={close} /> : null}
      {shell.modal === 'import-items' ? <GapImportItems onClose={close} /> : null}
      {shell.modal === 'locations-bins' ? <GapLocationsBins onClose={close} /> : null}
      {shell.modal === 'register-asset' ? <GapRegisterAsset onClose={close} /> : null}
      {shell.modal === 'purchase-order' ? <GapPurchaseOrder onClose={close} /> : null}
      {shell.modal === 'vendor-editor' ? <GapVendorEditor onClose={close} /> : null}
      {shell.modal === 'count-session' ? <GapCountSession onClose={close} /> : null}
      {shell.modal === 'requisition' ? <GapRequisition onClose={close} /> : null}
      {shell.modal === 'approval-drawer' ? <GapApprovalDrawer onClose={close} /> : null}
      {shell.modal === 'scanner-pair' ? <GapScannerPair onClose={close} /> : null}
      {shell.modal === 'snooze-settings' ? <GapSnoozeSettings onClose={close} /> : null}
      {shell.modal === 'kit-compare' ? <GapKitCompare onClose={close} /> : null}
      {shell.modal === 'driver-report-update' ? <GapDriverReportUpdate onClose={close} /> : null}
    </>
  );
}
