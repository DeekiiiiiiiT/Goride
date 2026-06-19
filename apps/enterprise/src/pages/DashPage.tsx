import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import {
  DashCtaSection,
  DashCustomerFeaturesSection,
  DashHeroSection,
  DashHowItWorksSection,
  DashMerchantSection,
  DashPreviewSection,
} from '@/components/dash/DashSections';
import { SERVICE_URLS } from '@/lib/siteContent';

export function DashPage() {
  return (
    <>
      <Header cta={{ label: 'Get Started', href: SERVICE_URLS.dash, external: true }} />
      <main id="main-content">
        <DashHeroSection />
        <DashCustomerFeaturesSection />
        <DashMerchantSection />
        <DashHowItWorksSection />
        <DashPreviewSection />
        <DashCtaSection />
      </main>
      <Footer />
    </>
  );
}
