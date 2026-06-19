import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import {
  RidesAppShowcaseSection,
  RidesDownloadCtaSection,
  RidesFeaturesSection,
  RidesFleetCarousel,
  RidesHeroSection,
  RidesPricingSection,
  RidesSafetySection,
} from '@/components/rides/RidesSections';
import { SERVICE_URLS } from '@/lib/siteContent';

export function RidesPage() {
  return (
    <>
      <Header cta={{ label: 'Get Started', href: SERVICE_URLS.rides, external: true }} />
      <main id="main-content">
        <RidesHeroSection />
        <RidesFeaturesSection />
        <RidesFleetCarousel />
        <RidesSafetySection />
        <RidesPricingSection />
        <RidesAppShowcaseSection />
        <RidesDownloadCtaSection />
      </main>
      <Footer />
    </>
  );
}
