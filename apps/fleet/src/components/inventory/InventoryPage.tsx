import { useState } from 'react';
import './inventory.css';
import { InventoryTabs, type InventoryTabId } from './InventoryTabs';
import { In17OperationalBanners } from './In17OperationalBanners';
import { In18Phone } from './screens/In18Phone';
import { InventoryShellProvider } from './InventoryShellContext';
import { In3ItemDrawer } from './screens/In3ItemDrawer';
import { In4ReceiveDialog } from './screens/In4ReceiveDialog';
import { In5IssueDialog } from './screens/In5IssueDialog';
import { In14CustodyDialog } from './screens/In14CustodyDialog';
import { In16FirstTimeSetup } from './screens/In16FirstTimeSetup';
import { In9AssetPage } from './screens/In9AssetPage';
import { In7KitTemplateEditor } from './screens/In7KitTemplateEditor';
import { InventoryModalFrame } from './InventoryModalFrame';
import { useInventoryShell } from './InventoryShellContext';
import { InventoryGapModals } from './InventoryGapModals';

function tabFromSearch(): InventoryTabId {
  const raw = new URLSearchParams(window.location.search).get('tab');
  const allowed: InventoryTabId[] = [
    'overview',
    'stock',
    'vehicle-kits',
    'assets',
    'movements',
    'purchasing',
    'counts',
    'alerts',
  ];
  return allowed.includes(raw as InventoryTabId) ? (raw as InventoryTabId) : 'overview';
}

function InventoryModals() {
  const shell = useInventoryShell();
  return (
    <>
      {shell.modal === 'item-drawer' ? (
        <InventoryModalFrame>
          <In3ItemDrawer />
        </InventoryModalFrame>
      ) : null}
      {shell.modal === 'receive' ? (
        <InventoryModalFrame>
          <In4ReceiveDialog />
        </InventoryModalFrame>
      ) : null}
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
      {shell.modal === 'kit-editor' ? (
        <InventoryModalFrame>
          <In7KitTemplateEditor />
        </InventoryModalFrame>
      ) : null}
      <InventoryGapModals />
    </>
  );
}

function InventoryPageBody() {
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

export function InventoryPage() {
  const [tab, setTab] = useState<InventoryTabId>(() => tabFromSearch());

  const setTabAndUrl = (next: InventoryTabId) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState({}, '', url.pathname + url.search);
  };

  return (
    <InventoryShellProvider tab={tab} setTab={setTabAndUrl}>
      <InventoryPageBody />
    </InventoryShellProvider>
  );
}
