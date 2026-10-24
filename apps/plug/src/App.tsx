import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import { plugSend } from './api';
import { readQueue, removeJob } from './offline';
import { PlugShell } from './shell/provider';
import { ExploreGate, GarageGate, InboxGate, PartsGate, SavedGate } from './screens/gates';
import { AccountScreen } from './screens/generated/AccountScreen';
import { AddVehicleMakeScreen } from './screens/generated/AddVehicleMakeScreen';
import { ChooseTypeScreen } from './screens/generated/ChooseTypeScreen';
import { ConfirmOdometerScreen } from './screens/generated/ConfirmOdometerScreen';
import { ContributionsScreen } from './screens/generated/ContributionsScreen';
import { DocumentReminderScreen } from './screens/generated/DocumentReminderScreen';
import { DocumentsScreen } from './screens/generated/DocumentsScreen';
import { FacilityScreen } from './screens/generated/FacilityScreen';
import { FuelDetailsScreen } from './screens/generated/FuelDetailsScreen';
import { FuelSpendScreen } from './screens/generated/FuelSpendScreen';
import { GpsIssueScreen } from './screens/generated/GpsIssueScreen';
import { HelpMapParishScreen } from './screens/generated/HelpMapParishScreen';
import { HelpScreen } from './screens/generated/HelpScreen';
import { HistoryScreen } from './screens/generated/HistoryScreen';
import { HowItWorksScreen } from './screens/generated/HowItWorksScreen';
import { LoginScreen } from './screens/generated/LoginScreen';
import { LogServiceScreen } from './screens/generated/LogServiceScreen';
import { MaintenanceScheduleScreen } from './screens/generated/MaintenanceScheduleScreen';
import { MechanicScreen } from './screens/generated/MechanicScreen';
import { ModelYearScreen } from './screens/generated/ModelYearScreen';
import { NotificationSettingsScreen } from './screens/generated/NotificationSettingsScreen';
import { OdometerScanScreen } from './screens/generated/OdometerScanScreen';
import { OtpScreen } from './screens/generated/OtpScreen';
import { PartDetailScreen } from './screens/generated/PartDetailScreen';
import { PartsResultsScreen } from './screens/generated/PartsResultsScreen';
import { PartsStoreScreen } from './screens/generated/PartsStoreScreen';
import { PendingPlaceScreen } from './screens/generated/PendingPlaceScreen';
import { PermissionsScreen } from './screens/generated/PermissionsScreen';
import { PlaceDetailsScreen } from './screens/generated/PlaceDetailsScreen';
import { PlacePinScreen } from './screens/generated/PlacePinScreen';
import { PrivacyConsentScreen } from './screens/generated/PrivacyConsentScreen';
import { PrivacyDataScreen } from './screens/generated/PrivacyDataScreen';
import { ProfileScreen } from './screens/generated/ProfileScreen';
import { SavedOfflineScreen } from './screens/generated/SavedOfflineScreen';
import { SearchScreen } from './screens/generated/SearchScreen';
import { ServiceItemScreen } from './screens/generated/ServiceItemScreen';
import { SettingsScreen } from './screens/generated/SettingsScreen';
import { SignupPhoneScreen } from './screens/generated/SignupPhoneScreen';
import { SplashScreen } from './screens/generated/SplashScreen';
import { StartingOdometerScreen } from './screens/generated/StartingOdometerScreen';
import { StationDetailScreen } from './screens/generated/StationDetailScreen';
import { StationListScreen } from './screens/generated/StationListScreen';
import { SubmittedScreen } from './screens/generated/SubmittedScreen';
import { TollsScreen } from './screens/generated/TollsScreen';
import { VehicleAddedScreen } from './screens/generated/VehicleAddedScreen';
import { VehicleNotFoundScreen } from './screens/generated/VehicleNotFoundScreen';
import { VehicleOverviewScreen } from './screens/generated/VehicleOverviewScreen';
import { WelcomeScreen } from './screens/generated/WelcomeScreen';

function SyncOffline() {
  useEffect(() => {
    const flush = () => {
      if (!navigator.onLine) return;
      for (const job of readQueue()) {
        void plugSend(job.path, 'POST', job.body).then(() => removeJob(job.id)).catch(() => undefined);
      }
    };
    window.addEventListener('online', flush);
    flush();
    return () => window.removeEventListener('online', flush);
  }, []);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <PlugShell>
          <SyncOffline />
          <Routes>
            <Route path="/" element={<SplashScreen />} />
            <Route path="/welcome" element={<WelcomeScreen />} />
            <Route path="/how" element={<HowItWorksScreen />} />
            <Route path="/signup" element={<SignupPhoneScreen />} />
            <Route path="/otp" element={<OtpScreen />} />
            <Route path="/profile" element={<ProfileScreen />} />
            <Route path="/consent" element={<PrivacyConsentScreen />} />
            <Route path="/permissions" element={<PermissionsScreen />} />
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/explore/loading" element={<Navigate to="/explore" replace />} />
            <Route path="/explore/empty" element={<Navigate to="/explore" replace />} />
            <Route path="/explore/offline" element={<Navigate to="/explore" replace />} />
            <Route path="/explore/guest" element={<Navigate to="/explore" replace />} />
            <Route path="/explore" element={<ExploreGate />} />
            <Route path="/explore/list" element={<StationListScreen />} />
            <Route path="/filters" element={<Navigate to="/explore" replace />} />
            <Route path="/stations/:id/directions" element={<StationDetailScreen />} />
            <Route path="/stations/:id" element={<StationDetailScreen />} />
            <Route path="/places/mechanic" element={<MechanicScreen />} />
            <Route path="/places/facility" element={<FacilityScreen />} />
            <Route path="/places/:id" element={<PartsStoreScreen />} />
            <Route path="/pending" element={<PendingPlaceScreen />} />
            <Route path="/tolls" element={<TollsScreen />} />
            <Route path="/search/empty" element={<Navigate to="/search" replace />} />
            <Route path="/search" element={<SearchScreen />} />
            <Route path="/fuel" element={<OdometerScanScreen />} />
            <Route path="/fuel/confirm" element={<ConfirmOdometerScreen />} />
            <Route path="/fuel/details" element={<FuelDetailsScreen />} />
            <Route path="/fuel/saved" element={<SavedGate />} />
            <Route path="/fuel/first" element={<Navigate to="/fuel/saved" replace />} />
            <Route path="/fuel/error" element={<Navigate to="/fuel/details" replace />} />
            <Route path="/fuel/offline" element={<SavedOfflineScreen />} />
            <Route path="/garage/empty" element={<Navigate to="/garage" replace />} />
            <Route path="/garage/remove" element={<Navigate to="/garage" replace />} />
            <Route path="/garage" element={<GarageGate />} />
            <Route path="/garage/add" element={<AddVehicleMakeScreen />} />
            <Route path="/garage/add/model" element={<ModelYearScreen />} />
            <Route path="/garage/add/missing" element={<VehicleNotFoundScreen />} />
            <Route path="/garage/add/odometer" element={<StartingOdometerScreen />} />
            <Route path="/garage/added" element={<VehicleAddedScreen />} />
            <Route path="/garage/:id" element={<VehicleOverviewScreen />} />
            <Route path="/garage/:id/schedule" element={<MaintenanceScheduleScreen />} />
            <Route path="/garage/:id/service" element={<ServiceItemScreen />} />
            <Route path="/garage/:id/log-service" element={<LogServiceScreen />} />
            <Route path="/garage/:id/history" element={<HistoryScreen />} />
            <Route path="/garage/:id/spend" element={<FuelSpendScreen />} />
            <Route path="/garage/:id/documents" element={<DocumentsScreen />} />
            <Route path="/garage/:id/documents/edit" element={<DocumentReminderScreen />} />
            <Route path="/parts" element={<PartsGate />} />
            <Route path="/parts/results" element={<PartsResultsScreen />} />
            <Route path="/parts/soon" element={<Navigate to="/parts" replace />} />
            <Route path="/parts/:partId" element={<PartDetailScreen />} />
            <Route path="/map" element={<ChooseTypeScreen />} />
            <Route path="/map/pin/poor" element={<Navigate to="/map/pin" replace />} />
            <Route path="/map/pin" element={<PlacePinScreen />} />
            <Route path="/map/withdraw" element={<Navigate to="/pending" replace />} />
            <Route path="/map/details" element={<PlaceDetailsScreen />} />
            <Route path="/map/submitted" element={<SubmittedScreen />} />
            <Route path="/map/submitted-toast" element={<Navigate to="/map/submitted" replace />} />
            <Route path="/contributions/approved" element={<Navigate to="/contributions" replace />} />
            <Route path="/contributions" element={<ContributionsScreen />} />
            <Route path="/parish" element={<HelpMapParishScreen />} />
            <Route path="/inbox/empty" element={<Navigate to="/inbox" replace />} />
            <Route path="/inbox" element={<InboxGate />} />
            <Route path="/account" element={<AccountScreen />} />
            <Route path="/account/notifications" element={<NotificationSettingsScreen />} />
            <Route path="/account/privacy" element={<PrivacyDataScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/help" element={<HelpScreen />} />
            <Route path="/gps" element={<GpsIssueScreen />} />
            <Route path="/offline" element={<Navigate to="/explore" replace />} />
            <Route path="/admin" element={<Navigate to="/explore" replace />} />
            <Route path="*" element={<Navigate to="/explore" replace />} />
          </Routes>
        </PlugShell>
      </HashRouter>
    </AuthProvider>
  );
}
