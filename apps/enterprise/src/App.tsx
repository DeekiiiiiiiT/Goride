import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

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

const BridgedDriversPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedDriversPage })),
);
const BridgedVehiclesPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedVehiclesPage })),
);
const BridgedMaintenancePage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedMaintenancePage })),
);
const BridgedEquipmentPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedEquipmentPage })),
);
const BridgedFuelPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedFuelPage })),
);
const BridgedTollLogsPage = lazy(() =>
  import('@/fleet-bridge/pages').then((m) => ({ default: m.BridgedTollLogsPage })),
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
    <BrowserRouter>
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
              <Gated module="shipments">
                <Suspense fallback={<Fall />}>
                  <ShipmentsListPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="shipments/new"
            element={
              <Gated module="shipments">
                <Suspense fallback={<Fall />}>
                  <NewShipmentPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="shipments/:id"
            element={
              <Gated module="shipments">
                <Suspense fallback={<Fall />}>
                  <ShipmentDetailPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="carriers"
            element={
              <Gated module="carriers">
                <Suspense fallback={<Fall />}>
                  <CarriersPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="clients"
            element={
              <Gated module="clients">
                <Suspense fallback={<Fall />}>
                  <ClientsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="rate-cards"
            element={
              <Gated module="rateCards">
                <Suspense fallback={<Fall />}>
                  <RateCardsPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="drivers"
            element={
              <Gated module="drivers">
                <Suspense fallback={<Fall />}>
                  <BridgedDriversPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="vehicles"
            element={
              <Gated module="vehicles">
                <Suspense fallback={<Fall />}>
                  <BridgedVehiclesPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="maintenance"
            element={
              <Gated module="vehicles">
                <Suspense fallback={<Fall />}>
                  <BridgedMaintenancePage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="equipment"
            element={
              <Gated module="fleetEquipment">
                <Suspense fallback={<Fall />}>
                  <BridgedEquipmentPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="fuel"
            element={
              <Gated module="fuelManagement">
                <Suspense fallback={<Fall />}>
                  <BridgedFuelPage />
                </Suspense>
              </Gated>
            }
          />
          <Route
            path="toll"
            element={
              <Gated module="tollManagement">
                <Suspense fallback={<Fall />}>
                  <BridgedTollLogsPage />
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
          <Route
            path="claims"
            element={
              <Gated module="claimableLoss">
                <Suspense fallback={<Fall />}>
                  <BridgedClaimsPage />
                </Suspense>
              </Gated>
            }
          />
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
  );
}
