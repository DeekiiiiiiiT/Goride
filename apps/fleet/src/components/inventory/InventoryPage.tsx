import './inventory.css';
import { InventoryTabs } from './InventoryTabs';
import { In17OperationalBanners } from './In17OperationalBanners';
import { In18Phone } from './screens/In18Phone';
import { In3ItemDrawer } from './screens/In3ItemDrawer';
import { In4ReceiveDialog } from './screens/In4ReceiveDialog';
import { In5IssueDialog } from './screens/In5IssueDialog';
import { In14CustodyDialog } from './screens/In14CustodyDialog';
import { In16FirstTimeSetup } from './screens/In16FirstTimeSetup';
import { In9AssetPage } from './screens/In9AssetPage';
import { In7KitTemplateEditor } from './screens/In7KitTemplateEditor';
import { In15VehicleKitCard } from './screens/In15VehicleKitCard';
import { InventoryModalFrame } from './InventoryModalFrame';
import { useInventoryShell } from './InventoryShellContext';
import { InventoryGapModals } from './InventoryGapModals';
import { InAssetMoveDialog } from './screens/InAssetMoveDialog';
import { InAssetConditionDialog } from './screens/InAssetConditionDialog';
import { InAssetRepairDialog } from './screens/InAssetRepairDialog';

function InventoryModals() {
  const shell = useInventoryShell();
  return (
    <>
      {shell.modal === 'item-drawer' ? (
        <InventoryModalFrame>
          <In3ItemDrawer />
        </InventoryModalFrame>
      ) : null}
      {shell.modal === 'receive' ? <In4ReceiveDialog /> : null}
      {shell.modal === 'issue' ? (
        <InventoryModalFrame>
          <In5IssueDialog />
        </InventoryModalFrame>
      ) : null}
      {shell.modal === 'custody' ? (
        <InventoryModalFrame>
          <In14CustodyDialog />
        </InventoryModalFrame>
      ) : null}
      {shell.modal === 'first-time-setup' ? (
        <InventoryModalFrame>
          <In16FirstTimeSetup />
        </InventoryModalFrame>
      ) : null}
      {shell.modal === 'asset-page' ? (
        <InventoryModalFrame>
          <In9AssetPage />
        </InventoryModalFrame>
      ) : null}
      {shell.modal === 'asset-move' ? (
        <InventoryModalFrame>
          <InAssetMoveDialog />
        </InventoryModalFrame>
      ) : null}
      {shell.modal === 'asset-condition' ? (
        <InventoryModalFrame>
          <InAssetConditionDialog />
        </InventoryModalFrame>
      ) : null}
      {shell.modal === 'asset-repair' ? (
        <InventoryModalFrame>
          <InAssetRepairDialog />
        </InventoryModalFrame>
      ) : null}
      {shell.modal === 'kit-editor' ? (
        <InventoryModalFrame>
          <In7KitTemplateEditor />
        </InventoryModalFrame>
      ) : null}
      {shell.modal === 'kit-card' ? (
        <InventoryModalFrame>
          <In15VehicleKitCard vehicleId={shell.selectedVehicleId} />
        </InventoryModalFrame>
      ) : null}
      <InventoryGapModals />
    </>
  );
}

export function InventoryPageBody() {
  const shell = useInventoryShell();

  return (
    <div className="fleet-inventory-stitch w-full min-h-0">
      <In17OperationalBanners
        showError={Boolean(shell.errorBanner)}
        showDiscrepancy={Boolean(shell.discrepancyBanner)}
        showReadOnly={shell.readOnly}
        errorMessage={shell.errorBanner ?? undefined}
        discrepancyMessage={shell.discrepancyBanner ?? undefined}
      />
      <div className="md:hidden">
        <In18Phone />
      </div>
      <div className="hidden md:block">
        <InventoryTabs tab={shell.tab} onTabChange={shell.setTab} />
      </div>
      <InventoryModals />
    </div>
  );
}

/** @deprecated Use InventoryPageGate — provider lives outside the lazy chunk. */
export function InventoryPage() {
  return <InventoryPageBody />;
}
