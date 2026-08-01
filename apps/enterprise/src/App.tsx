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
const FinancePage = lazy(() =>
  import('@/app/freight/PlaceholderPages').then((m) => ({ default: m.FinancePage })),
);
const ClaimsPage = lazy(() =>
  import('@/app/freight/PlaceholderPages').then((m) => ({ default: m.ClaimsPage })),
);
const SettingsPage = lazy(() =>
  import('@/app/freight/PlaceholderPages').then((m) => ({ default: m.SettingsPage })),
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
              <Suspense fallback={<Fall />}>
                <ShipmentsListPage />
              </Suspense>
            }
          />
          <Route
            path="shipments/new"
            element={
              <Suspense fallback={<Fall />}>
                <NewShipmentPage />
              </Suspense>
            }
          />
          <Route
            path="shipments/:id"
            element={
              <Suspense fallback={<Fall />}>
                <ShipmentDetailPage />
              </Suspense>
            }
          />
          <Route
            path="carriers"
            element={
              <Suspense fallback={<Fall />}>
                <CarriersPage />
              </Suspense>
            }
          />
          <Route
            path="clients"
            element={
              <Suspense fallback={<Fall />}>
                <ClientsPage />
              </Suspense>
            }
          />
          <Route
            path="rate-cards"
            element={
              <Suspense fallback={<Fall />}>
                <RateCardsPage />
              </Suspense>
            }
          />
          <Route
            path="finance"
            element={
              <Suspense fallback={<Fall />}>
                <FinancePage />
              </Suspense>
            }
          />
          <Route
            path="claims"
            element={
              <Suspense fallback={<Fall />}>
                <ClaimsPage />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<Fall />}>
                <SettingsPage />
              </Suspense>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
