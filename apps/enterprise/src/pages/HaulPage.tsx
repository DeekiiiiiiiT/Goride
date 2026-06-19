import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import {
  HaulAppShowcaseSection,
  HaulAudienceSection,
  HaulComplianceSection,
  HaulCtaSection,
  HaulHeroSection,
  HaulVehicleNetworkSection,
} from '@/components/haul/HaulSections';
import { SERVICE_URLS } from '@/lib/siteContent';

export function HaulPage() {
  return (
    <>
      <Header cta={{ label: 'Get Started', href: SERVICE_URLS.haul, external: true }} />
      <main id="main-content">
        <HaulHeroSection />
        <HaulAudienceSection />
        <HaulVehicleNetworkSection />
        <HaulAppShowcaseSection />
        <HaulComplianceSection />
        <HaulCtaSection />
      </main>
      <Footer />
    </>
  );
}
