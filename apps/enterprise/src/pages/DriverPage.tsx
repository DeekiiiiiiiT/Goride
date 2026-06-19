import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import {
  DriverAppShowcaseSection,
  DriverBenefitsSection,
  DriverCtaSection,
  DriverEarningsCalculator,
  DriverHeroSection,
  DriverOnboardingSection,
  DriverSupportSection,
} from '@/components/driver/DriverSections';
import { DRIVER_APP_URL } from '@/lib/driverContent';

export function DriverPage() {
  return (
    <>
      <Header cta={{ label: 'Sign Up', href: DRIVER_APP_URL, external: true }} />
      <main id="main-content" className="overflow-x-hidden">
        <DriverHeroSection />
        <DriverEarningsCalculator />
        <DriverBenefitsSection />
        <DriverOnboardingSection />
        <DriverAppShowcaseSection />
        <DriverSupportSection />
        <DriverCtaSection />
      </main>
      <Footer />
    </>
  );
}
