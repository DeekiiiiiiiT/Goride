import { useInventoryShell } from './InventoryShellContext';
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
      {shell.modal === 'purchase-order' ? (
        <GapPurchaseOrder poId={shell.selectedPoId} onClose={close} />
      ) : null}
      {shell.modal === 'vendor-editor' ? (
        <GapVendorEditor vendorId={shell.selectedVendorId} onClose={close} />
      ) : null}
      {shell.modal === 'count-session' ? <GapCountSession onClose={close} /> : null}
      {shell.modal === 'requisition' ? <GapRequisition onClose={close} /> : null}
      {shell.modal === 'approval-drawer' ? (
        <GapApprovalDrawer approvalId={shell.selectedApprovalId} onClose={close} />
      ) : null}
      {shell.modal === 'scanner-pair' ? <GapScannerPair onClose={close} /> : null}
      {shell.modal === 'snooze-settings' ? <GapSnoozeSettings onClose={close} /> : null}
      {shell.modal === 'kit-compare' ? <GapKitCompare onClose={close} /> : null}
      {shell.modal === 'driver-report-update' ? (
        <GapDriverReportUpdate reportId={shell.selectedReportId} onClose={close} />
      ) : null}
    </>
  );
}
