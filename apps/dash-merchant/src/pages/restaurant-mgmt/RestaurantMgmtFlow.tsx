import { useCallback, useEffect, useState } from 'react';
import { Merchant } from '../../hooks/useMerchant';
import {
  CAPABILITY_IN_STORE,
  canAccessRestaurantMgmt,
  hasCapability,
} from '../../lib/merchant-capabilities';
import { readFlag } from '../../lib/partner-feature-flags';
import {
  FIXTURE_IN_STORE_SALES,
  FIXTURE_PRINT_JOBS,
  FIXTURE_SETUP_DRAFT,
} from '../../lib/restaurant-mgmt-fixtures';
import {
  fetchInStoreSales,
  fetchPrintJobs,
  fetchSettings,
  patchSettings,
  testPrint,
} from '../../lib/restaurant-mgmt-api';
import RestaurantMgmtHub, {
  type RestaurantMgmtModule,
} from '../../components/restaurant-mgmt/RestaurantMgmtHub';
import RestaurantMgmtModulePicker from '../../components/restaurant-mgmt/RestaurantMgmtModulePicker';
import RestaurantMgmtSetupWizard from '../../components/restaurant-mgmt/RestaurantMgmtSetupWizard';
import PrintSettingsPanel from '../../components/restaurant-mgmt/PrintSettingsPanel';
import InStoreSalesReportView from '../../components/restaurant-mgmt/InStoreSalesReport';
import EnterpriseInventoryFlow from '../enterprise-inventory/EnterpriseInventoryFlow';
import PosRegisterPage from './PosRegisterPage';

function isSetupDone(merchantId: string) {
  return localStorage.getItem(`roam_restaurant_mgmt_setup_done_${merchantId}`) === '1';
}

interface RestaurantMgmtFlowProps {
  merchant: Merchant;
  onBack: () => void;
  /** Deep-link into a module; omit to show the module picker first */
  initialSection?: RestaurantMgmtModule;
}

export default function RestaurantMgmtFlow({
  merchant,
  onBack,
  initialSection,
}: RestaurantMgmtFlowProps) {
  const useApi = hasCapability(merchant, CAPABILITY_IN_STORE);
  const hidePosModule = readFlag(merchant.id, 'venueOpsV2');

  const [flow, setFlow] = useState<'setup' | 'hub'>('hub');
  const [activeModule, setActiveModule] = useState<RestaurantMgmtModule | null>(
    initialSection ?? null,
  );

  const [printJobs, setPrintJobs] = useState(FIXTURE_PRINT_JOBS);
  const [settings, setSettings] = useState({
    printerId: FIXTURE_SETUP_DRAFT.printerName as string | null,
    receiptFooter: FIXTURE_SETUP_DRAFT.receiptFooter,
    taxRatePercent: FIXTURE_SETUP_DRAFT.taxRatePercent,
    showInStoreOnCounter: false,
    showInStoreOnKitchen: false,
  });
  const [salesToday, setSalesToday] = useState({
    range: 'today',
    total: FIXTURE_IN_STORE_SALES.todayTotal,
    orderCount: FIXTURE_IN_STORE_SALES.orderCountToday,
    avgTicket: FIXTURE_IN_STORE_SALES.avgTicket,
  });
  const [salesWeek, setSalesWeek] = useState({
    range: 'week',
    total: FIXTURE_IN_STORE_SALES.weekTotal,
    orderCount: 0,
    avgTicket: FIXTURE_IN_STORE_SALES.avgTicket,
  });

  const resolveInitialFlow = useCallback(() => {
    if (!canAccessRestaurantMgmt(merchant.id, merchant)) return 'hub';
    if (useApi && !isSetupDone(merchant.id)) return 'setup';
    return 'hub';
  }, [merchant, useApi]);

  useEffect(() => {
    setFlow(resolveInitialFlow());
  }, [resolveInitialFlow]);

  useEffect(() => {
    if (initialSection) setActiveModule(initialSection);
  }, [initialSection]);

  const loadApiData = useCallback(async () => {
    if (!useApi) return;
    try {
      const [jobs, sett, today, week] = await Promise.all([
        fetchPrintJobs(),
        fetchSettings(),
        fetchInStoreSales('today'),
        fetchInStoreSales('week'),
      ]);
      setPrintJobs(jobs);
      setSettings({
        printerId: sett.printerId,
        receiptFooter: sett.receiptFooter,
        taxRatePercent: sett.taxRatePercent,
        showInStoreOnCounter: sett.showInStoreOnCounter,
        showInStoreOnKitchen: sett.showInStoreOnKitchen,
      });
      setSalesToday(today);
      setSalesWeek(week);
    } catch {
      // Keep fixtures on error
    }
  }, [useApi]);

  useEffect(() => {
    void loadApiData();
  }, [loadApiData]);

  const backToPicker = () => {
    setActiveModule(null);
  };

  if (!canAccessRestaurantMgmt(merchant.id, merchant)) {
    return (
      <div className="min-h-dvh bg-surface p-margin-mobile md:p-margin-tablet">
        <button type="button" onClick={onBack} className="mb-inset-md text-label-md text-primary-container">
          ← Back
        </button>
        <p className="text-body-md text-on-surface-variant">
          Restaurant Management is not enabled for this store. Ask your Roam admin to turn it on in the
          partner portal.
        </p>
      </div>
    );
  }

  if (flow === 'setup') {
    return (
      <RestaurantMgmtSetupWizard
        merchantId={merchant.id}
        useApi={useApi}
        onComplete={() => setFlow('hub')}
        onBack={onBack}
      />
    );
  }

  if (activeModule === null) {
    return (
      <RestaurantMgmtModulePicker
        merchantId={merchant.id}
        hidePos={hidePosModule}
        onSelect={setActiveModule}
        onBack={onBack}
      />
    );
  }

  if (activeModule === 'inventory') {
    return (
      <EnterpriseInventoryFlow
        merchant={merchant}
        onBack={backToPicker}
        sectionTitle="Inventory"
      />
    );
  }

  return (
    <RestaurantMgmtHub section={activeModule} onBackToPicker={backToPicker}>
      {activeModule === 'pos' && (
        <PosRegisterPage
          merchant={merchant}
          useApi={useApi}
          taxRatePercent={settings.taxRatePercent}
        />
      )}
      {activeModule === 'reports' && (
        <InStoreSalesReportView today={salesToday} week={salesWeek} />
      )}
      {activeModule === 'settings' && (
        <PrintSettingsPanel
          printerId={settings.printerId}
          receiptFooter={settings.receiptFooter}
          printJobs={printJobs}
          useApi={useApi}
          showInStoreOnCounter={settings.showInStoreOnCounter}
          showInStoreOnKitchen={settings.showInStoreOnKitchen}
          onSaveSettings={async (patch) => {
            if (useApi) {
              const updated = await patchSettings(patch);
              setSettings((s) => ({
                ...s,
                printerId: updated.printerId,
                receiptFooter: updated.receiptFooter,
                showInStoreOnCounter: updated.showInStoreOnCounter,
                showInStoreOnKitchen: updated.showInStoreOnKitchen,
              }));
            } else {
              setSettings((s) => ({
                ...s,
                showInStoreOnCounter: patch.showInStoreOnCounter ?? s.showInStoreOnCounter,
                showInStoreOnKitchen: patch.showInStoreOnKitchen ?? s.showInStoreOnKitchen,
              }));
            }
          }}
          onTestPrint={async () => {
            if (useApi) await testPrint();
          }}
          onRefreshJobs={() => void loadApiData()}
        />
      )}
    </RestaurantMgmtHub>
  );
}
