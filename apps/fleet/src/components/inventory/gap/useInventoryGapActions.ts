import { useEffect } from 'react';
import type { InventoryModalId } from '../InventoryShellContext';
import { inventoryApi } from '../inventoryApi';
import { useInventoryShell } from '../InventoryShellContext';

async function handleGapSave(modal: InventoryModalId, shell: ReturnType<typeof useInventoryShell>) {
  switch (modal) {
    case 'inventory-settings':
      await inventoryApi.updateSettings({ safety_notice_text: shell.gapDraft?.safetyNotice ?? undefined });
      break;
    case 'opening-balances':
      if (shell.gapDraft?.openingBalance) {
        await inventoryApi.openingBalance(shell.gapDraft.openingBalance, crypto.randomUUID());
      }
      break;
    case 'import-items':
      if (shell.gapDraft?.importFile) {
        await inventoryApi.importItems(shell.gapDraft.importFile);
      }
      break;
    case 'count-session':
      if (shell.gapDraft?.countSession) {
        await inventoryApi.startCountSession(shell.gapDraft.countSession);
      }
      break;
    case 'purchase-order':
      if (shell.gapDraft?.purchaseOrder) {
        await inventoryApi.createPurchaseOrder(shell.gapDraft.purchaseOrder);
      }
      break;
    case 'vendor-editor':
      if (shell.gapDraft?.vendor) {
        await inventoryApi.createVendor(shell.gapDraft.vendor);
      }
      break;
    case 'requisition':
      if (shell.gapDraft?.requisition) {
        await inventoryApi.createRequisition(shell.gapDraft.requisition);
      }
      break;
    case 'register-asset':
      if (shell.gapDraft?.asset) {
        await inventoryApi.registerAsset(shell.gapDraft.asset);
      }
      break;
    case 'approval-drawer':
      if (shell.selectedApprovalId) {
        await inventoryApi.approveApproval(shell.selectedApprovalId);
      }
      break;
    case 'scanner-pair':
      await inventoryApi.scannerPair({ pairing_code: shell.gapDraft?.pairingCode ?? '000000' });
      break;
    case 'snooze-settings':
      if (shell.gapDraft?.alertRules) {
        await inventoryApi.updateAlertRules(shell.gapDraft.alertRules as unknown[]);
      }
      break;
    case 'driver-report-update':
      if (shell.selectedReportId) {
        await inventoryApi.resolveDriverReport(shell.selectedReportId, shell.gapDraft?.reportResolve ?? {});
      }
      break;
    default:
      break;
  }
  await shell.refresh();
}

export function useInventoryGapActions(modal: InventoryModalId) {
  const shell = useInventoryShell();

  useEffect(() => {
    if (modal === 'none') return;
    const root = document.querySelector('[data-gap-root="true"]');
    if (!root) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button');
      if (!button) return;
      const label = (button.textContent ?? '').trim().toLowerCase();
      if (!/save|submit|approve|start count|post|confirm|register|pair|import|issue|send/.test(label)) {
        return;
      }
      event.preventDefault();
      void handleGapSave(modal, shell)
        .then(() => shell.closeModal())
        .catch((error) => {
          shell.setErrorBanner(error instanceof Error ? error.message : 'Save failed');
        });
    };

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [modal, shell]);
}
