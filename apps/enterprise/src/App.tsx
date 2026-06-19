import { BrowserRouter, Route, Routes } from 'react-router-dom';
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
      </Routes>
    </BrowserRouter>
  );
}