import { useCallback, useEffect, useState } from 'react';
import { Merchant } from '../../hooks/useMerchant';
import {
  CAPABILITY_IN_STORE,
  canAccessRestaurantMgmt,
  hasCapability,
} from '../../lib/merchant-capabilities';
import { readFlag } from '../../lib/partner-feature-flags';
import {
  FIXTURE_INGREDIENTS,
  FIXTURE_IN_STORE_SALES,
  FIXTURE_PRINT_JOBS,
  FIXTURE_RECIPES,
  FIXTURE_SETUP_DRAFT,
} from '../../lib/restaurant-mgmt-fixtures';
import {
  adjustStock,
  createIngredient,
  fetchIngredients,
  fetchInStoreSales,
  fetchPrintJobs,
  fetchRecipes,
  fetchSettings,
  patchSettings,
  saveRecipes,
  testPrint,
} from '../../lib/restaurant-mgmt-api';
import { useMerchantMenu } from '../../hooks/useMerchantMenu';
import RestaurantMgmtHub, {
  RestaurantMgmtSection,
} from '../../components/restaurant-mgmt/RestaurantMgmtHub';
import RestaurantMgmtSetupWizard from '../../components/restaurant-mgmt/RestaurantMgmtSetupWizard';
import RestaurantMgmtOptInCard from '../../components/restaurant-mgmt/RestaurantMgmtOptInCard';
import InventoryOverview from '../../components/restaurant-mgmt/InventoryOverview';
import IngredientsList from '../../components/restaurant-mgmt/IngredientsList';
import RecipeEditor from '../../components/restaurant-mgmt/RecipeEditor';
import PrintSettingsPanel from '../../components/restaurant-mgmt/PrintSettingsPanel';
import InStoreSalesReportView from '../../components/restaurant-mgmt/InStoreSalesReport';
import PosRegisterPage from './PosRegisterPage';

type InventoryView = 'overview' | 'ingredients' | 'recipes';

function isSetupDone(merchantId: string) {
  return localStorage.getItem(`roam_restaurant_mgmt_setup_done_${merchantId}`) === '1';
}

interface RestaurantMgmtFlowProps {
  merchant: Merchant;
  onBack: () => void;
}

export default function RestaurantMgmtFlow({ merchant, onBack }: RestaurantMgmtFlowProps) {
  const previewOnly =
    readFlag(merchant.id, 'restaurantMgmtPreviewV1') && !hasCapability(merchant, CAPABILITY_IN_STORE);
  const useApi = hasCapability(merchant, CAPABILITY_IN_STORE);

  const [flow, setFlow] = useState<'opt-in' | 'setup' | 'hub'>('hub');
  const [section, setSection] = useState<RestaurantMgmtSection>('pos');
  const [inventoryView, setInventoryView] = useState<InventoryView>('overview');

  const [ingredients, setIngredients] = useState(FIXTURE_INGREDIENTS);
  const [recipes, setRecipes] = useState(FIXTURE_RECIPES);
  const [printJobs, setPrintJobs] = useState(FIXTURE_PRINT_JOBS);
  const [settings, setSettings] = useState<{
    printerId: string | null;
    receiptFooter: string;
    taxRatePercent: number;
    showInStoreOnCounter: boolean;
    showInStoreOnKitchen: boolean;
  }>({
    printerId: FIXTURE_SETUP_DRAFT.printerName,
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

  const menuQuery = useMerchantMenu(useApi ? merchant.id : '');

  const resolveInitialFlow = useCallback(() => {
    if (!canAccessRestaurantMgmt(merchant.id, merchant)) return 'opt-in';
    if (useApi && !isSetupDone(merchant.id)) return 'setup';
    if (previewOnly && !isSetupDone(merchant.id)) return 'setup';
    if (!useApi && previewOnly) return isSetupDone(merchant.id) ? 'hub' : 'setup';
    if (!useApi) return 'opt-in';
    return 'hub';
  }, [merchant, previewOnly, useApi]);

  useEffect(() => {
    setFlow(resolveInitialFlow());
  }, [resolveInitialFlow]);

  const loadApiData = useCallback(async () => {
    if (!useApi) return;
    try {
      const [ing, rec, jobs, sett, today, week] = await Promise.all([
        fetchIngredients(),
        fetchRecipes(),
        fetchPrintJobs(),
        fetchSettings(),
        fetchInStoreSales('today'),
        fetchInStoreSales('week'),
      ]);
      setIngredients(ing);
      setRecipes(rec);
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
      // Keep fixtures as fallback on error
    }
  }, [useApi]);

  useEffect(() => {
    void loadApiData();
  }, [loadApiData]);

  if (!canAccessRestaurantMgmt(merchant.id, merchant)) {
    return null;
  }

  if (flow === 'opt-in') {
    return (
      <div className="min-h-dvh bg-surface p-margin-mobile md:p-margin-tablet">
        <button
          type="button"
          onClick={onBack}
          className="mb-inset-md text-label-md text-primary-container"
        >
          ← Back
        </button>
        <RestaurantMgmtOptInCard
          merchant={merchant}
          onOpenRestaurantMgmt={() => setFlow(previewOnly ? 'setup' : 'setup')}
        />
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

  const menuItems =
    useApi && menuQuery.data
      ? menuQuery.data.items.map((i) => ({ id: i.id, name: i.name }))
      : FIXTURE_RECIPES.map((r) => ({ id: r.menuItemId, name: r.menuItemName }));

  const inventoryContent = () => {
    if (inventoryView === 'ingredients') {
      return (
        <IngredientsList
          ingredients={ingredients}
          useApi={useApi}
          onRefresh={() => void loadApiData()}
          onCreateIngredient={async (input) => {
            if (useApi) await createIngredient(input);
          }}
          onAdjustStock={async (id, delta, reason) => {
            if (useApi) await adjustStock(id, delta, reason);
          }}
        />
      );
    }
    if (inventoryView === 'recipes') {
      return (
        <RecipeEditor
          menuItems={menuItems}
          ingredients={ingredients}
          recipes={recipes}
          useApi={useApi}
          onSave={async (menuItemId, lines) => {
            if (useApi) await saveRecipes(menuItemId, lines);
            await loadApiData();
          }}
        />
      );
    }
    return (
      <InventoryOverview
        ingredients={ingredients}
        onOpenIngredients={() => setInventoryView('ingredients')}
        onOpenRecipes={() => setInventoryView('recipes')}
      />
    );
  };

  return (
    <RestaurantMgmtHub
      activeSection={section}
      onSectionChange={(next) => {
        setSection(next);
        if (next === 'inventory') setInventoryView('overview');
      }}
      onBack={onBack}
    >
      {section === 'pos' && (
        <PosRegisterPage
          merchant={merchant}
          useApi={useApi}
          taxRatePercent={settings.taxRatePercent}
        />
      )}
      {section === 'inventory' && inventoryContent()}
      {section === 'reports' && (
        <InStoreSalesReportView today={salesToday} week={salesWeek} />
      )}
      {section === 'settings' && (
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
