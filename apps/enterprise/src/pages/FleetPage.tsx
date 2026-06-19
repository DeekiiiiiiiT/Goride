import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import {
  FleetCommandCenterSection,
  FleetCtaSection,
  FleetFeaturesSection,
  FleetHeroSection,
  FleetIntegrationsSection,
  FleetPricingSection,
  FleetTestimonialsSection,
  FleetUseCasesSection,
} from '@/components/fleet/FleetSections';
import { SERVICE_URLS } from '@/lib/siteContent';

export function FleetPage() {
  return (
    <>
      <Header cta={{ label: 'Get Started', href: SERVICE_URLS.fleet, external: true }} />
      <main id="main-content">
        <FleetHeroSection />
        <FleetFeaturesSection />
        <FleetCommandCenterSection />
        <FleetUseCasesSection />
        <FleetIntegrationsSection />
        <FleetPricingSection />
        <FleetTestimonialsSection />
        <FleetCtaSection />
      </main>
      <Footer />
    </>
  );
}
