import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './auth';
import { plugSend } from './api';
import { readQueue, removeJob } from './offline';
import { Shell } from './Shell';
import {
  Account,
  AddMake,
  Consent,
  Contributions,
  Directions,
  DocumentEdit,
  Documents,
  Explore,
  Filters,
  FuelConfirm,
  FuelDetails,
  FuelError,
  FuelOffline,
  FuelSaved,
  FuelScan,
  Garage,
  GpsIssue,
  Guest,
  Help,
  History,
  HowItWorks,
  Inbox,
  LogService,
  Login,
  MapChoose,
  MapDetails,
  MapPin,
  MapSubmitted,
  MissingCar,
  ModelYear,
  NotifySettings,
  Offline,
  Otp,
  ParishHelp,
  PartDetail,
  PartsHome,
  PartsResults,
  PartsSoon,
  PendingPlace,
  Permissions,
  PlaceDetail,
  PlaceKind,
  PlugAdmin,
  PoorGps,
  PrivacyData,
  Profile,
  RemoveVehicle,
  Schedule,
  Search,
  ServiceItem,
  Settings,
  SignUp,
  Spend,
  Splash,
  StartingOdo,
  StationDetail,
  StationListPage,
  Tolls,
  VehicleAdded,
  VehicleOverview,
  Welcome,
  WithdrawPin,
} from './screens';

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
        <SyncOffline />
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/how" element={<HowItWorks />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/otp" element={<Otp />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/consent" element={<Consent />} />
          <Route path="/permissions" element={<Permissions />} />
          <Route path="/login" element={<Login />} />
          <Route element={<Shell />}>
            <Route path="/explore/loading" element={<Explore />} />
            <Route path="/explore/empty" element={<Explore />} />
            <Route path="/explore/offline" element={<Offline />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/explore/guest" element={<Guest />} />
            <Route path="/explore/list" element={<StationListPage />} />
            <Route path="/filters" element={<Filters />} />
            <Route path="/stations/:id/directions" element={<Directions />} />
            <Route path="/stations/:id" element={<StationDetail />} />
            <Route path="/places/mechanic" element={<PlaceKind kind="mechanic" />} />
            <Route path="/places/facility" element={<PlaceKind kind="restroom" />} />
            <Route path="/places/:id" element={<PlaceDetail />} />
            <Route path="/pending" element={<PendingPlace />} />
            <Route path="/tolls" element={<Tolls />} />
            <Route path="/search/empty" element={<Search />} />
            <Route path="/search" element={<Search />} />
            <Route path="/fuel" element={<FuelScan />} />
            <Route path="/fuel/confirm" element={<FuelConfirm />} />
            <Route path="/fuel/details" element={<FuelDetails />} />
            <Route path="/fuel/saved" element={<FuelSaved />} />
            <Route path="/fuel/first" element={<FuelSaved />} />
            <Route path="/fuel/error" element={<FuelError />} />
            <Route path="/fuel/offline" element={<FuelOffline />} />
            <Route path="/garage/empty" element={<Garage />} />
            <Route path="/garage/remove" element={<RemoveVehicle />} />
            <Route path="/garage" element={<Garage />} />
            <Route path="/garage/add" element={<AddMake />} />
            <Route path="/garage/add/model" element={<ModelYear />} />
            <Route path="/garage/add/missing" element={<MissingCar />} />
            <Route path="/garage/add/odometer" element={<StartingOdo />} />
            <Route path="/garage/added" element={<VehicleAdded />} />
            <Route path="/garage/:id" element={<VehicleOverview />} />
            <Route path="/garage/:id/schedule" element={<Schedule />} />
            <Route path="/garage/:id/service" element={<ServiceItem />} />
            <Route path="/garage/:id/log-service" element={<LogService />} />
            <Route path="/garage/:id/history" element={<History />} />
            <Route path="/garage/:id/spend" element={<Spend />} />
            <Route path="/garage/:id/documents" element={<Documents />} />
            <Route path="/garage/:id/documents/edit" element={<DocumentEdit />} />
            <Route path="/parts" element={<PartsHome />} />
            <Route path="/parts/results" element={<PartsResults />} />
            <Route path="/parts/soon" element={<PartsSoon />} />
            <Route path="/parts/:partId" element={<PartDetail />} />
            <Route path="/map" element={<MapChoose />} />
            <Route path="/map/pin/poor" element={<PoorGps />} />
            <Route path="/map/pin" element={<MapPin />} />
            <Route path="/map/withdraw" element={<WithdrawPin />} />
            <Route path="/map/details" element={<MapDetails />} />
            <Route path="/map/submitted" element={<MapSubmitted />} />
            <Route path="/contributions/approved" element={<Contributions />} />
            <Route path="/contributions" element={<Contributions />} />
            <Route path="/map/submitted-toast" element={<MapSubmitted />} />
            <Route path="/parish" element={<ParishHelp />} />
            <Route path="/inbox/empty" element={<Inbox />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/account" element={<Account />} />
            <Route path="/account/notifications" element={<NotifySettings />} />
            <Route path="/account/privacy" element={<PrivacyData />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/help" element={<Help />} />
            <Route path="/gps" element={<GpsIssue />} />
            <Route path="/offline" element={<Offline />} />
            <Route path="/admin" element={<PlugAdmin />} />
          </Route>
          <Route path="*" element={<Navigate to="/explore" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
