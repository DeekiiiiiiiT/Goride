import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PwaProvider } from '@fleet/components/pwa/PwaProvider';
import { PwaLifecycleHost } from '@fleet/components/pwa/PwaLifecycleHost';
import { StandaloneHomeToLoginRedirect } from '@/app/pwa/StandaloneHomeToLoginRedirect';

import { AccessibilityPage } from '@/pages/AccessibilityPage';
import { CookiesPage } from '@/pages/CookiesPage';
import { PrivacyPage } from '@/pages/PrivacyPage';
import { TermsPage } from '@/pages/TermsPage';
import { AboutPage } from '@/pages/AboutPage';
import { CareersPage } from '@/pages/CareersPage';
import { ContactPage } from '@/pages/ContactPage';
import { DashPage } from '@/pages/DashPage';
import { DriverPage } from '@/pages/DriverPage';
import { EnterprisePage } from '@/pages/EnterprisePage';
import { FleetPage } from '@/pages/FleetPage';
import { HaulPage } from '@/pages/HaulPage';
import { HelpPage } from '@/pages/HelpPage';
import { HomePage } from '@/pages/HomePage';
import { RidesPage } from '@/pages/RidesPage';
import { SafetyPage } from '@/pages/SafetyPage';
import { Gated } from '@/app/modules/Gated';

const LoginEntry = lazy(() => import('@/app/entries/LoginEntry'));
const ResetPasswordEntry = lazy(() => import('@/app/entries/ResetPasswordEntry'));
const AdminEntry = lazy(() => import('@/app/entries/AdminEntry'));
const AppEntry = lazy(() => import('@/app/entries/AppEntry'));

const DashboardPage = lazy(() =>
  import('@/app/freight/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ShipmentsListPage = lazy(() =>
  import('@/app/freight/ShipmentsListPage').then((m) => ({ default: m.ShipmentsListPage })),
);
const NewShipmentPage = lazy(() =>
  import('@/app/freight/NewShipmentPage').then((m) => ({ default: m.NewShipmentPage })),
);
const ShipmentDetailPage = lazy(() =>
  import('@/app/freight/ShipmentDetailPage').then((m) => ({ default: m.ShipmentDetailPage })),
);
const CarriersPage = lazy(() =>
  import('@/app/freight/CarriersPage').then((m) => ({ default: m.CarriersPage })),
);
const ClientsPage = lazy(() =>
  import('@/app/freight/ClientsPage').then((m) => ({ default: m.ClientsPage })),
);
const RateCardsPage = lazy(() =>
  import('@/app/freight/RateCardsPage').then((m) => ({ default: m.RateCardsPage })),
);
const SuitesPage = lazy(() =>
  import('@/app/freight/SuitesPage').then((m) => ({ default: m.SuitesPage })),
);
const PackagesListPage = lazy(() =>
  import('@/app/freight/PackagesPages').then((m) => ({ default: m.PackagesListPage })),
);
const PackageDetailPage = lazy(() =>
  import('@/app/freight/PackagesPages').then((m) => ({ default: m.PackageDetailPage })),
);
const MiamiScanPage = lazy(() =>
  import('@/app/freight/MiamiScanPage').then((m) => ({ default: m.MiamiScanPage })),
);
const ManifestsListPage = lazy(() =>
  import('@/app/freight/ManifestPages').then((m) => ({ default: m.ManifestsListPage })),
);
const ManifestDetailPage = lazy(() =>
  import('@/app/freight/ManifestPages').then((m) => ({ default: m.ManifestDetailPage })),
);
const CustomsBoardPage = lazy(() =>
  import('@/app/freight/CustomsBoardPage').then((m) => ({ default: m.CustomsBoardPage })),
);
const HubStationPage = lazy(() =>
  import('@/app/freight/HubStationPage').then((m) => ({ default: m.HubStationPage })),
);
const FulfillmentDeskPage = lazy(() =>
  import('@/app/freight/FulfillmentPages').then((m) => ({ default: m.FulfillmentDeskPage })),
);
const DeliveryBatchDetailPage = lazy(() =>
  import('@/app/freight/FulfillmentPages').then((m) => ({
    default: m.DeliveryBatchDetailPage,
  })),
);
const ClientFleetPage = lazy(() =>
  import('@/app/freight/FulfillmentPages').then((m) => ({ default: m.ClientFleetPage })),
);
const PodCapturePage = lazy(() =>
  import('@/app/freight/PodCapturePage').then((m) => ({ default: m.PodCapturePage })),
);
const DispatchBoardPage = lazy(() =>
  import('@/app/dispatch/DispatchBoardPage').then((m) => ({ default: m.DispatchBoardPage })),
);
const ServiceZonesPage = lazy(() =>
  import('@/app/dispatch/ServiceZonesPage').then((m) => ({ default: m.ServiceZonesPage })),
);

const BridgedDriversPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedDriversPage })),
);
const BridgedDriverAnalyticsPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedDriverAnalyticsPage })),
);
const BridgedVehiclesPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedVehiclesPage })),
);
const BridgedVehicleAnalyticsPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedVehicleAnalyticsPage })),
);
const BridgedMaintenancePage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedMaintenancePage })),
);
const BridgedEquipmentPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedEquipmentPage })),
);
const BridgedFuelAnalyticsPage = lazy(() =>
  import('@/fleet-bridge/FuelPages').then((m) => ({ default: m.BridgedFuelAnalyticsPage })),
);
const BridgedFuelReviewQueuePage = lazy(() =>
  import('@/fleet-bridge/FuelPages').then((m) => ({ default: m.BridgedFuelReviewQueuePage })),
);
const BridgedFuelCardsPage = lazy(() =>
  import('@/fleet-bridge/FuelPages').then((m) => ({ default: m.BridgedFuelCardsPage })),
);
const BridgedFuelLogsPage = lazy(() =>
  import('@/fleet-bridge/FuelPages').then((m) => ({ default: m.BridgedFuelLogsPage })),
);
const BridgedTollLogsPage = lazy(() =>
  import('@/fleet-bridge/TollPages').then((m) => ({ default: m.BridgedTollLogsPage })),
);
const BridgedTagInventoryPage = lazy(() =>
  import('@/fleet-bridge/TollPages').then((m) => ({ default: m.BridgedTagInventoryPage })),
);
const BridgedTollAnalyticsPage = lazy(() =>
  import('@/fleet-bridge/TollPages').then((m) => ({ default: m.BridgedTollAnalyticsPage })),
);
const BridgedTripsPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedTripsPage })),
);
const BridgedDataCenterPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedDataCenterPage })),
);
const BridgedReportsPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedReportsPage })),
);
const BridgedBusinessFinancePage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedBusinessFinancePage })),
);
const BridgedClaimsPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedClaimsPage })),
);
const BridgedUserManagementPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedUserManagementPage })),
);
const BridgedSettingsPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedSettingsPage })),
);

function Fall() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <PwaProvider>
      <PwaLifecycleHost />
      <BrowserRouter>
      <StandaloneHomeToLoginRedirect />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/rides" element={<RidesPage />} />
        <Route path="/driver" element={<DriverPage />} />
        <Route path="/haul" element={<HaulPage />} />
        <Route path="/fleet" element={<FleetPage />} />
        <Route path="/dash" element={<DashPage />} />
        <Route path="/enterprise" element={<EnterprisePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/careers" element={<CareersPage />} />
        <Route path="/safety" element={<SafetyPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="/accessibility" element={<AccessibilityPage />} />

        <Route
          path="/login"
          element={
            <Suspense fallback={<Fall />}>
              <LoginEntry />
            </Suspense>
          }
        />
        <Route
          path="/reset-password"
          element={
            <Suspense fallback={<Fall />}>
              <ResetPasswordEntry />
            </Suspense>
          }
        />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<Fall />}>
              <AdminEntry />
            </Suspense>
          }
        />
        <Route
          path="/pod/:token"
          element={
            <Suspense fallback={<Fall />}>
              <PodCapturePage />
            </Suspense>
          }
        />
        <Route
          path="/app"
          element={
            <Suspense fallback={<Fall />}>
              <AppEntry />
            </Suspense>
          }
        >
          <Route
            index
            element={
              <Suspense fallback={<Fall />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="shipments"
            element={
              <Gated module="freight_shipments">
                <Suspense fallback={<Fall />}>
                  <ShipmentsListPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="dispatch"
            element={
              <Gated module="freight_dispatch">
                <Suspense fallback={<Fall />}>
                  <DispatchBoardPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="service-zones"
            element={
              <Gated module="freight_service_zones">
                <Suspense fallback={<Fall />}>
                  <ServiceZonesPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="shipments/new"
            element={
              <Gated module="freight_shipments">
                <Suspense fallback={<Fall />}>
                  <NewShipmentPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="shipments/:id"
            element={
              <Gated module="freight_shipments">
                <Suspense fallback={<Fall />}>
                  <ShipmentDetailPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="carriers"
            element={
              <Gated module="freight_carriers">
                <Suspense fallback={<Fall />}>
                  <CarriersPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="clients"
            element={
              <Gated module="freight_clients">
                <Suspense fallback={<Fall />}>
                  <ClientsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="rate-cards"
            element={
              <Gated module="freight_rate_cards">
                <Suspense fallback={<Fall />}>
                  <RateCardsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="suites"
            element={
              <Gated module="freight_suites">
                <Suspense fallback={<Fall />}>
                  <SuitesPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="packages"
            element={
              <Gated module="freight_mailbox_packages">
                <Suspense fallback={<Fall />}>
                  <PackagesListPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="packages/:id"
            element={
              <Gated module="freight_mailbox_packages">
                <Suspense fallback={<Fall />}>
                  <PackageDetailPage />
                </Suspense>
              </Gated>
            }
          />
          <Route path="warehouse" element={<Navigate to="/app/miami-scan" replace />} />
          <Route path="mailbox" element={<Navigate to="/app/packages" replace />} />
          <Route path="last-mile" element={<Navigate to="/app/fulfillment" replace />} />
          <Route path="setup" element={<Navigate to="/app/shipments" replace />} />
          <Route path="fleet-ops" element={<Navigate to="/app/fuel/logs" replace />} />
          <Route path="system" element={<Navigate to="/app/settings" replace />} />
          <Route
            path="miami-scan"
            element={
              <Gated module="freight_miami_scan">
                <Suspense fallback={<Fall />}>
                  <MiamiScanPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="manifests"
            element={
              <Gated module="freight_manifests">
                <Suspense fallback={<Fall />}>
                  <ManifestsListPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="manifests/:id"
            element={
              <Gated module="freight_manifests">
                <Suspense fallback={<Fall />}>
                  <ManifestDetailPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="customs"
            element={
              <Gated module="freight_customs_board">
                <Suspense fallback={<Fall />}>
                  <CustomsBoardPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="hub"
            element={
              <Gated module="freight_hub_station">
                <Suspense fallback={<Fall />}>
                  <HubStationPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="fulfillment"
            element={
              <Gated module="freight_fulfillment">
                <Suspense fallback={<Fall />}>
                  <FulfillmentDeskPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="fulfillment/batches/:id"
            element={
              <Gated module="freight_fulfillment">
                <Suspense fallback={<Fall />}>
                  <DeliveryBatchDetailPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="client-fleet"
            element={
              <Gated module="freight_client_fleet">
                <Suspense fallback={<Fall />}>
                  <ClientFleetPage />
                </Suspense>
              </Gated>
            }
          />
          <Route path="drivers" element={<Navigate to="/app/drivers/list" replace />} />
          <Route
            path="drivers/list"
            element={
              <Gated module="drivers">
                <Suspense fallback={<Fall />}>
                  <BridgedDriversPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="drivers/analytics"
            element={
              <Gated module="drivers">
                <Suspense fallback={<Fall />}>
                  <BridgedDriverAnalyticsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route path="vehicles" element={<Navigate to="/app/vehicles/list" replace />} />
          <Route
            path="vehicles/list"
            element={
              <Gated module="vehicles">
                <Suspense fallback={<Fall />}>
                  <BridgedVehiclesPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="vehicles/analytics"
            element={
              <Gated module="vehicles">
                <Suspense fallback={<Fall />}>
                  <BridgedVehicleAnalyticsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="vehicles/maintenance"
            element={
              <Gated module="vehicles">
                <Suspense fallback={<Fall />}>
                  <BridgedMaintenancePage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="vehicles/inventory"
            element={
              <Gated module="fleetEquipment">
                <Suspense fallback={<Fall />}>
                  <BridgedEquipmentPage />
                </Suspense>
              </Gated>
            }
          />
          <Route path="maintenance" element={<Navigate to="/app/vehicles/maintenance" replace />} />
          <Route path="equipment" element={<Navigate to="/app/vehicles/inventory" replace />} />
          <Route path="fuel" element={<Navigate to="/app/fuel/logs" replace />} />
          <Route
            path="fuel/analytics"
            element={
              <Gated module="fuelManagement">
                <Suspense fallback={<Fall />}>
                  <BridgedFuelAnalyticsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="fuel/review-queue"
            element={
              <Gated module="fuelManagement">
                <Suspense fallback={<Fall />}>
                  <BridgedFuelReviewQueuePage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="fuel/cards"
            element={
              <Gated module="fuelManagement">
                <Suspense fallback={<Fall />}>
                  <BridgedFuelCardsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="fuel/logs"
            element={
              <Gated module="fuelManagement">
                <Suspense fallback={<Fall />}>
                  <BridgedFuelLogsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route path="toll" element={<Navigate to="/app/toll/logs" replace />} />
          <Route
            path="toll/logs"
            element={
              <Gated module="tollManagement">
                <Suspense fallback={<Fall />}>
                  <BridgedTollLogsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="toll/tag-inventory"
            element={
              <Gated module="tollManagement">
                <Suspense fallback={<Fall />}>
                  <BridgedTagInventoryPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="toll/analytics"
            element={
              <Gated module="tollManagement">
                <Suspense fallback={<Fall />}>
                  <BridgedTollAnalyticsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="toll/claims"
            element={
              <Gated module="claimableLoss">
                <Suspense fallback={<Fall />}>
                  <BridgedClaimsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="trips"
            element={
              <Gated module="trips">
                <Suspense fallback={<Fall />}>
                  <BridgedTripsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="data-center"
            element={
              <Gated module="dataCenter">
                <Suspense fallback={<Fall />}>
                  <BridgedDataCenterPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="reports"
            element={
              <Gated module="reports">
                <Suspense fallback={<Fall />}>
                  <BridgedReportsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="finance"
            element={
              <Gated module="businessFinance">
                <Suspense fallback={<Fall />}>
                  <BridgedBusinessFinancePage />
                </Suspense>
              </Gated>
            }
          />
          <Route path="claims" element={<Navigate to="/app/toll/claims" replace />} />
          <Route
            path="team"
            element={
              <Gated module="teamManagement">
                <Suspense fallback={<Fall />}>
                  <BridgedUserManagementPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<Fall />}>
                <BridgedSettingsPage />
              </Suspense>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </BrowserRouter>
    </PwaProvider>
  );
}
