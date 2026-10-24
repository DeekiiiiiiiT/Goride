import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './auth';
import { plugSend } from './api';
import { readQueue, removeJob } from './offline';
import { PlugAdmin } from './screens';
import { StitchScreen } from './stitch/StitchScreen';

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

function Screen({ file }: { file: string }) {
  return <StitchScreen file={file} />;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <SyncOffline />
        <Routes>
          <Route path="/" element={<Screen file="01-splash.html" />} />
          <Route path="/welcome" element={<Screen file="02-welcome.html" />} />
          <Route path="/how" element={<Screen file="03-how-it-works.html" />} />
          <Route path="/signup" element={<Screen file="04-signup-phone.html" />} />
          <Route path="/otp" element={<Screen file="05-otp.html" />} />
          <Route path="/profile" element={<Screen file="06-profile.html" />} />
          <Route path="/consent" element={<Screen file="07-privacy-consent.html" />} />
          <Route path="/permissions" element={<Screen file="08-permissions.html" />} />
          <Route path="/login" element={<Screen file="14-login.html" />} />
          <Route path="/explore/loading" element={<Screen file="15b-explore-loading.html" />} />
          <Route path="/explore/empty" element={<Screen file="15c-empty-map.html" />} />
          <Route path="/explore/offline" element={<Screen file="15d-offline-chip.html" />} />
          <Route path="/explore" element={<Screen file="15-home-explore.html" />} />
          <Route path="/explore/guest" element={<Screen file="16-guest-mode.html" />} />
          <Route path="/explore/list" element={<Screen file="17-station-list.html" />} />
          <Route path="/filters" element={<Screen file="18-filters.html" />} />
          <Route path="/stations/:id/directions" element={<Screen file="19b-directions.html" />} />
          <Route path="/stations/:id" element={<Screen file="19-station-detail.html" />} />
          <Route path="/places/mechanic" element={<Screen file="21-mechanic.html" />} />
          <Route path="/places/facility" element={<Screen file="22-facility.html" />} />
          <Route path="/places/:id" element={<Screen file="20-parts-store.html" />} />
          <Route path="/pending" element={<Screen file="23-pending-place.html" />} />
          <Route path="/tolls" element={<Screen file="48-tolls.html" />} />
          <Route path="/search/empty" element={<Screen file="49b-empty-search.html" />} />
          <Route path="/search" element={<Screen file="49-search.html" />} />
          <Route path="/fuel" element={<Screen file="24-odometer-scan.html" />} />
          <Route path="/fuel/confirm" element={<Screen file="25-confirm-odometer.html" />} />
          <Route path="/fuel/details" element={<Screen file="26-fuel-details.html" />} />
          <Route path="/fuel/saved" element={<Screen file="27-saved.html" />} />
          <Route path="/fuel/first" element={<Screen file="27b-first-save.html" />} />
          <Route path="/fuel/error" element={<Screen file="26b-save-error.html" />} />
          <Route path="/fuel/offline" element={<Screen file="28-saved-offline.html" />} />
          <Route path="/garage/empty" element={<Screen file="29b-empty-garage.html" />} />
          <Route path="/garage/remove" element={<Screen file="30b-remove-vehicle.html" />} />
          <Route path="/garage" element={<Screen file="29-my-vehicles.html" />} />
          <Route path="/garage/add" element={<Screen file="09-add-vehicle-make.html" />} />
          <Route path="/garage/add/model" element={<Screen file="10-model-year.html" />} />
          <Route path="/garage/add/missing" element={<Screen file="11-vehicle-not-found.html" />} />
          <Route path="/garage/add/odometer" element={<Screen file="12-starting-odometer.html" />} />
          <Route path="/garage/added" element={<Screen file="13-vehicle-added.html" />} />
          <Route path="/garage/:id" element={<Screen file="30-vehicle-overview.html" />} />
          <Route path="/garage/:id/schedule" element={<Screen file="31-maintenance-schedule.html" />} />
          <Route path="/garage/:id/service" element={<Screen file="32-service-item.html" />} />
          <Route path="/garage/:id/log-service" element={<Screen file="33-log-service.html" />} />
          <Route path="/garage/:id/history" element={<Screen file="34-history.html" />} />
          <Route path="/garage/:id/spend" element={<Screen file="35-fuel-spend.html" />} />
          <Route path="/garage/:id/documents" element={<Screen file="36-documents.html" />} />
          <Route path="/garage/:id/documents/edit" element={<Screen file="37-document-reminder.html" />} />
          <Route path="/parts" element={<Screen file="38-parts-categories.html" />} />
          <Route path="/parts/results" element={<Screen file="39-parts-results.html" />} />
          <Route path="/parts/soon" element={<Screen file="41-parts-coming-soon.html" />} />
          <Route path="/parts/:partId" element={<Screen file="40-part-detail.html" />} />
          <Route path="/map" element={<Screen file="42-choose-type.html" />} />
          <Route path="/map/pin/poor" element={<Screen file="43c-poor-gps.html" />} />
          <Route path="/map/pin" element={<Screen file="43-place-pin.html" />} />
          <Route path="/map/withdraw" element={<Screen file="23b-withdraw.html" />} />
          <Route path="/map/details" element={<Screen file="44-place-details.html" />} />
          <Route path="/map/submitted" element={<Screen file="45-submitted.html" />} />
          <Route path="/contributions/approved" element={<Screen file="46b-approved.html" />} />
          <Route path="/contributions" element={<Screen file="46-contributions.html" />} />
          <Route path="/map/submitted-toast" element={<Screen file="45c-submitted-toast.html" />} />
          <Route path="/parish" element={<Screen file="47-help-map-parish.html" />} />
          <Route path="/inbox/empty" element={<Screen file="50b-empty-inbox.html" />} />
          <Route path="/inbox" element={<Screen file="50-notifications.html" />} />
          <Route path="/account" element={<Screen file="51-account.html" />} />
          <Route path="/account/notifications" element={<Screen file="52-notification-settings.html" />} />
          <Route path="/account/privacy" element={<Screen file="53-privacy-data.html" />} />
          <Route path="/settings" element={<Screen file="54-settings.html" />} />
          <Route path="/help" element={<Screen file="55-help.html" />} />
          <Route path="/gps" element={<Screen file="56-gps-issue.html" />} />
          <Route path="/offline" element={<Screen file="57-offline.html" />} />
          <Route path="/admin" element={<PlugAdmin />} />
          <Route path="*" element={<Navigate to="/explore" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
